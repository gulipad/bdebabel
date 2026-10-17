import { describe, expect, it } from 'vitest';
import { locate, steps } from './address';

describe('locate', () => {
	it('reads the six parts of an address', () => {
		expect(locate('babel-1:2bwWz7:4:1:1:399')).toEqual({
			universe: 'babel-1',
			hexagon: '2bwWz7',
			wall: 4,
			shelf: 1,
			volume: 1,
			page: 399
		});
	});
	it('refuses coordinates out of range and stray characters', () => {
		expect(locate('babel-1:abc:5:1:1:1')).toBeNull();
		expect(locate('babel-1:abc:1:1:1:411')).toBeNull();
		expect(locate('babel-1:a-b:1:1:1:1')).toBeNull();
		expect(locate('babel-1:abc:1:1:1')).toBeNull();
	});
});

describe('steps', () => {
	it('writes distances the Spanish way', () => {
		expect(steps(2282)).toBe('2.282');
		expect(steps(12345)).toBe('12.345');
	});
});
