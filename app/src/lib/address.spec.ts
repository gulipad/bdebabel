import { describe, expect, it } from 'vitest';
import { addressIn, brief, locate, parsePlace, placeParts, steps, strangers } from './address';

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

describe('parsePlace', () => {
	it('reads a full address, and one cut short', () => {
		expect(parsePlace('babel-1:2bwWz7:4:1:1:399')).toEqual({
			universe: 'babel-1',
			hexagon: '2bwWz7',
			wall: 4,
			shelf: 1,
			volume: 1,
			page: 399,
			phrase: undefined
		});
		expect(parsePlace('babel-1:2bwWz7:4:2')).toMatchObject({
			hexagon: '2bwWz7',
			wall: 4,
			shelf: 2
		});
		expect(parsePlace('babel-1:2bwWz7:4:2')?.volume).toBeUndefined();
	});
	it('reads a room on its own name, in the default universe', () => {
		expect(parsePlace('  2bwWz7 ')).toMatchObject({ universe: 'babel-1', hexagon: '2bwWz7' });
	});
	it('reads the links to rooms and pages, encoded or not', () => {
		expect(parsePlace('https://example.org/sala/2bwWz7?muro=3&balda=5')).toMatchObject({
			hexagon: '2bwWz7',
			wall: 3,
			shelf: 5
		});
		expect(
			parsePlace('http://localhost:5199/babel-1%3A2bwWz7%3A1%3A2%3A3%3A4?frase=te+quiero')
		).toMatchObject({
			hexagon: '2bwWz7',
			wall: 1,
			shelf: 2,
			volume: 3,
			page: 4,
			phrase: 'te quiero'
		});
	});
	it('refuses what is not a place', () => {
		expect(parsePlace('')).toBeNull();
		expect(parsePlace('hola, ¿qué tal?')).toBeNull();
		expect(parsePlace('babel-1:2bwWz7:5')).toBeNull();
		expect(parsePlace('babel-1:2bwWz7:1:1:1:411')).toBeNull();
	});
});

describe('placeParts and strangers', () => {
	it('reads a place out of range without judging it, so what is wrong can be said', () => {
		expect(placeParts('2bwWz7:7:1')).toMatchObject({ hexagon: '2bwWz7', wall: 7, shelf: 1 });
		expect(parsePlace('2bwWz7:7:1')).toBeNull();
	});
	it('names the characters a room cannot have', () => {
		expect(strangers('2bw-Wñz7ñ')).toBe('-ñ');
		expect(strangers('2bwWz7')).toBe('');
	});
});
