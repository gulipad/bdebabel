;; int8 matrix × int8 vector -> int32, with fixed-width WebAssembly SIMD only (deterministic everywhere).
;; Weights are row-major int8 in [-127, 127]; activations int8 in [-127, 127]; cols is a multiple of 16.
;; Per 16 columns: extmul low/high to i16 (|w·a| <= 16129, so the sum of two fits in i16), add, then
;; pairwise-widen to i32 and accumulate. Four rows at a time share each activation load.
(module
  (import "env" "mem" (memory 1))
  (func $dot (param $w i32) (param $a i32) (param $cols i32) (result v128)
    (local $acc v128) (local $c i32) (local $av v128) (local $wv v128)
    (local.set $acc (v128.const i32x4 0 0 0 0))
    (local.set $c (i32.const 0))
    (block $done (loop $l
      (br_if $done (i32.ge_u (local.get $c) (local.get $cols)))
      (local.set $av (v128.load (i32.add (local.get $a) (local.get $c))))
      (local.set $wv (v128.load (i32.add (local.get $w) (local.get $c))))
      (local.set $acc (i32x4.add (local.get $acc) (i32x4.extadd_pairwise_i16x8_s
        (i16x8.add (i16x8.extmul_low_i8x16_s (local.get $wv) (local.get $av))
                   (i16x8.extmul_high_i8x16_s (local.get $wv) (local.get $av))))))
      (local.set $c (i32.add (local.get $c) (i32.const 16)))
      (br $l)))
    (local.get $acc))
  (func $hsum (param $v v128) (result i32)
    (i32.add (i32.add (i32x4.extract_lane 0 (local.get $v)) (i32x4.extract_lane 1 (local.get $v)))
             (i32.add (i32x4.extract_lane 2 (local.get $v)) (i32x4.extract_lane 3 (local.get $v)))))
  ;; out[r] = sum_c W[r, c] * a[c]
  (func (export "matvec") (param $w i32) (param $a i32) (param $out i32) (param $rows i32) (param $cols i32)
    (local $r i32) (local $c i32) (local $av v128)
    (local $w0 i32) (local $w1 i32) (local $w2 i32) (local $w3 i32)
    (local $s0 v128) (local $s1 v128) (local $s2 v128) (local $s3 v128) (local $p v128)
    (local.set $r (i32.const 0))
    (block $quad_done (loop $quad
      (br_if $quad_done (i32.gt_u (i32.add (local.get $r) (i32.const 4)) (local.get $rows)))
      (local.set $w0 (i32.add (local.get $w) (i32.mul (local.get $r) (local.get $cols))))
      (local.set $w1 (i32.add (local.get $w0) (local.get $cols)))
      (local.set $w2 (i32.add (local.get $w1) (local.get $cols)))
      (local.set $w3 (i32.add (local.get $w2) (local.get $cols)))
      (local.set $s0 (v128.const i32x4 0 0 0 0)) (local.set $s1 (v128.const i32x4 0 0 0 0))
      (local.set $s2 (v128.const i32x4 0 0 0 0)) (local.set $s3 (v128.const i32x4 0 0 0 0))
      (local.set $c (i32.const 0))
      (block $cd (loop $cl
        (br_if $cd (i32.ge_u (local.get $c) (local.get $cols)))
        (local.set $av (v128.load (i32.add (local.get $a) (local.get $c))))
        (local.set $p (v128.load (i32.add (local.get $w0) (local.get $c))))
        (local.set $s0 (i32x4.add (local.get $s0) (i32x4.extadd_pairwise_i16x8_s (i16x8.add
          (i16x8.extmul_low_i8x16_s (local.get $p) (local.get $av)) (i16x8.extmul_high_i8x16_s (local.get $p) (local.get $av))))))
        (local.set $p (v128.load (i32.add (local.get $w1) (local.get $c))))
        (local.set $s1 (i32x4.add (local.get $s1) (i32x4.extadd_pairwise_i16x8_s (i16x8.add
          (i16x8.extmul_low_i8x16_s (local.get $p) (local.get $av)) (i16x8.extmul_high_i8x16_s (local.get $p) (local.get $av))))))
        (local.set $p (v128.load (i32.add (local.get $w2) (local.get $c))))
        (local.set $s2 (i32x4.add (local.get $s2) (i32x4.extadd_pairwise_i16x8_s (i16x8.add
          (i16x8.extmul_low_i8x16_s (local.get $p) (local.get $av)) (i16x8.extmul_high_i8x16_s (local.get $p) (local.get $av))))))
        (local.set $p (v128.load (i32.add (local.get $w3) (local.get $c))))
        (local.set $s3 (i32x4.add (local.get $s3) (i32x4.extadd_pairwise_i16x8_s (i16x8.add
          (i16x8.extmul_low_i8x16_s (local.get $p) (local.get $av)) (i16x8.extmul_high_i8x16_s (local.get $p) (local.get $av))))))
        (local.set $c (i32.add (local.get $c) (i32.const 16)))
        (br $cl)))
      (i32.store (i32.add (local.get $out) (i32.shl (local.get $r) (i32.const 2))) (call $hsum (local.get $s0)))
      (i32.store (i32.add (local.get $out) (i32.shl (i32.add (local.get $r) (i32.const 1)) (i32.const 2))) (call $hsum (local.get $s1)))
      (i32.store (i32.add (local.get $out) (i32.shl (i32.add (local.get $r) (i32.const 2)) (i32.const 2))) (call $hsum (local.get $s2)))
      (i32.store (i32.add (local.get $out) (i32.shl (i32.add (local.get $r) (i32.const 3)) (i32.const 2))) (call $hsum (local.get $s3)))
      (local.set $r (i32.add (local.get $r) (i32.const 4)))
      (br $quad)))
    (block $tail_done (loop $tail
      (br_if $tail_done (i32.ge_u (local.get $r) (local.get $rows)))
      (i32.store (i32.add (local.get $out) (i32.shl (local.get $r) (i32.const 2)))
        (call $hsum (call $dot (i32.add (local.get $w) (i32.mul (local.get $r) (local.get $cols))) (local.get $a) (local.get $cols))))
      (local.set $r (i32.add (local.get $r) (i32.const 1)))
      (br $tail))))
)
