"""
Address scrambling: a keyed permutation of the integers that preserves bit length.

Locations people see (and walk between) are scrambled; the codec works on unscrambled numbers.
Within each bit length k, the numbers [2^(k-1), 2^k) are shuffled by a Feistel network over
their low k-1 bits. So:
  - neighbouring locations open unrelated pages (as in Basile's Library);
  - a location and its page always have the same length, so distance from the center
    (address length = surprisal) is a property of the page, untouched by scrambling;
  - 0 and 1 map to themselves: the very center stays the center.

The key is part of the universe (manifest), like the model weights.
"""
import hashlib

ROUNDS = 6


def _prf(key: bytes, rnd: int, width: int, x: int) -> int:
    """A keyed pseudorandom function to `width` bits (SHA-256 in counter mode)."""
    if width == 0: return 0
    data = rnd.to_bytes(2, "big") + x.to_bytes((x.bit_length() + 7) // 8 or 1, "big")
    out, i = b"", 0
    while len(out) * 8 < width:
        out += hashlib.sha256(key + i.to_bytes(4, "big") + data).digest(); i += 1
    return int.from_bytes(out, "big") >> (len(out) * 8 - width)


def _feistel(key: bytes, n: int, bits: int, inverse: bool) -> int:
    """Permutes a `bits`-bit integer. Unbalanced split when bits is odd; still a bijection."""
    if bits <= 1: return n
    a_bits = bits // 2; b_bits = bits - a_bits
    left, right = n >> b_bits, n & ((1 << b_bits) - 1)   # left has a_bits, right has b_bits
    rounds = range(ROUNDS - 1, -1, -1) if inverse else range(ROUNDS)
    for r in rounds:
        # Alternate which half is updated so both get mixed. XOR undoes itself, so the
        # inverse is the same rounds in reverse order.
        if r % 2 == 0: left ^= _prf(key, r, a_bits, right)
        else: right ^= _prf(key, r, b_bits, left)
    return (left << b_bits) | right


def scramble(key: bytes, n: int) -> int:
    """Codec number -> visible location (same bit length)."""
    k = n.bit_length()
    if k <= 1: return n
    top = 1 << (k - 1)
    return top | _feistel(key, n - top, k - 1, inverse=False)


def unscramble(key: bytes, loc: int) -> int:
    """Visible location -> codec number (same bit length)."""
    k = loc.bit_length()
    if k <= 1: return loc
    top = 1 << (k - 1)
    return top | _feistel(key, loc - top, k - 1, inverse=True)


if __name__ == "__main__":
    import random
    key = b"test"
    rng = random.Random(0)
    for n in list(range(0, 300)) + [rng.getrandbits(k) for k in (64, 2048, 2201, 5000) for _ in range(20)]:
        s = scramble(key, n)
        assert unscramble(key, s) == n and s.bit_length() == n.bit_length(), n
    for k in range(2, 12):  # a true permutation of each length class
        lo, hi = 1 << (k - 1), 1 << k
        assert sorted(scramble(key, n) for n in range(lo, hi)) == list(range(lo, hi))
    a, b = 1 << 2200 | 12345, (1 << 2200 | 12345) + 1
    print("neighbours differ in", bin(scramble(key, a) ^ scramble(key, b)).count("1"), "of 2201 bits")
    print("scramble ok")
