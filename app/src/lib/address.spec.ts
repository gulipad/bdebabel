import { describe, expect, it } from 'vitest';
import { addressIn, brief, locate, steps } from './address';

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

describe('addressIn', () => {
	it('builds an address that locate reads back', () => {
		const a = addressIn('babel-1', '2bwWz7', 3, 5, 32, 410);
		expect(a).toBe('babel-1:2bwWz7:3:5:32:410');
		expect(locate(a)).toEqual({
			universe: 'babel-1',
			hexagon: '2bwWz7',
			wall: 3,
			shelf: 5,
			volume: 32,
			page: 410
		});
	});
});

describe('brief', () => {
	it('shortens long hexagon names to their ends, and leaves short ones alone', () => {
		expect(brief('abcdefghijklmnop', 3)).toBe('abc…nop');
		expect(brief('abcdefg', 3)).toBe('abcdefg');
	});
});
