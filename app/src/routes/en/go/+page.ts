import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

/** English's way to an address was called Go, and lived here, until it was Browse: old links still arrive. */
export function load() {
	redirect(308, resolve('/en/browse'));
}
