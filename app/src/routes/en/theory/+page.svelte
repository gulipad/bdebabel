<script lang="ts">
	/**
	 * Theory, in English: the article, translated from Teoría (routes/teoria), with the same drawings in English.
	 * Its styles are Teoría's, kept the same by hand. Its figures (sizes, distances, rings) are babel-en-1's own.
	 */
	import { resolve } from '$app/paths';
	import Anatomy from '#lib/theory/Anatomy.svelte';
	import Bijection from '#lib/theory/Bijection.svelte';
	import Intervals from '#lib/theory/Intervals.svelte';
	import Lengths from '#lib/theory/Lengths.svelte';
	import Log from '#lib/theory/Log.svelte';
	import Nesting from '#lib/theory/Nesting.svelte';
	import Rings from '#lib/theory/Rings.svelte';
	import InkLink from '#lib/ui/InkLink.svelte';
	import { melt } from '#lib/ui/melt.ts';
</script>

<svelte:head>
	<title>Theory · The Library of Babel</title>
	<meta
		name="description"
		content="How the Library works: from Borges to Basile, and from Basile to a Librarian who knows English."
	/>
</svelte:head>

{#snippet credit()}
	<p class="credit">
		Built with ❤️ by <a
			class="out"
			href="https://gulipad.com"
			target="_blank"
			rel="noopener noreferrer"
			>Gulipad<svg viewBox="0 0 12 12" aria-hidden="true"
				><path d="M5 2.5H2.5v7h7V7 M7 2.5h2.5V5 M9.5 2.5 5.5 6.5" /></svg
			><span class="sr">(opens in a new tab)</span></a
		>
	</p>
{/snippet}

<article class="theory">
	<h1>The Infinite Library</h1>

	<blockquote class="preamble">
		<p>
			Everything that was ever written lives here. Everything that has ever happened to you,
			everything you have ever thought, everything you have ever done. Everything you haven't, too.
			This Library contains - literally - every possible combination of 3,200 characters, some 10<sup
				>7,113</sup
			> pages. If you spent infinite eternities looking through random pages, you would find the story
			of your whole life here - and always in the same book.
		</p>
	</blockquote>

	<p class="opening">
		In 1938, Jorge Luis Borges starts working as an assistant at the Miguel Cané Municipal Library
		in Buenos Aires. He spends long days there, among towers of cedar wood, guardians of the books
		that maybe inspired his later work. He catalogues so fast that his colleagues ask him to slow
		down so they don't look too bad. So he gets through the work in an hour and spends the rest of
		the day reading and writing in the basement. Three years later, in <i
			>The Garden of Forking Paths</i
		>, he publishes a short story about a library that contains every possible book. “The Library of
		Babel”.
	</p>
	<p>
		In the story, the Library is the whole universe: a succession of hexagonal galleries with no
		beginning and no end. Each room has four walls of five shelves with 32 books each, and each book
		has 410 pages of 40 lines of 80 letters, written with 25 symbols. No two books are the same,
		because every possible one is there.
	</p>

	<Anatomy />

	<p>
		And there are a great many of them, though not infinitely many. Each of Borges's books has
		1,312,000 characters, so there are 25<sup>1,312,000</sup> different books, a 1 followed by more than
		1,800,000 zeros. One of them holds your biography. Others hold all its false versions, and the refutation
		of each one.
	</p>
	<p>
		Almost all of it, mind you, is noise. The librarians in the story spend their lives walking the
		galleries to find, with luck, a single line that makes sense.
	</p>

	<section use:melt={{ onView: true }}>
		<h2>Basile's Library</h2>
		<p>
			One of my favourite corners of the internet was built by Jonathan Basile in 2015. At <a
				class="out"
				href="https://libraryofbabel.info"
				target="_blank"
				rel="noopener noreferrer"
				>libraryofbabel.info<svg viewBox="0 0 12 12" aria-hidden="true"
					><path d="M5 2.5H2.5v7h7V7 M7 2.5h2.5V5 M9.5 2.5 5.5 6.5" /></svg
				><span class="sr">(opens in a new tab)</span></a
			>
			you'll find every possible page of 3,200 characters written with 29 symbols (the letters, the space,
			the comma and the full stop). That is 29<sup>3,200</sup>, some 10<sup>4,680</sup> pages. They aren't
			stored anywhere, because they wouldn't fit anywhere.
		</p>
		<p>
			There are some 10<sup>80</sup> atoms in the observable universe. Each page takes up about 2
			KB, so we would need ~10<sup>4,683</sup> bytes. If every atom in the universe were a
			1-petabyte disk, it would hold 10<sup>95</sup> bytes. If every atom of that universe were in turn
			another universe, we would need to nest 59 universes just to be able to store this Library. These
			are absurdly large numbers.
		</p>

		<Nesting />

		<p>
			So, what Basile programmed is a reversible function. It turns an address (room, wall, shelf,
			book, page) into a page. Opening a page means applying the function, and searching for a text
			means applying it backwards.
		</p>

		<Bijection />

		<p>
			But Basile's Library has a problem. If you open a page at random, it is all but certain that
			you'll find nothing but noise. A soup of random letters. The chance that a random page begins
			with a particular 30-letter sentence is 1 in 10<sup>44</sup>.
		</p>

		<p>
			In homage to Borges and to Basile, I wanted to build a new library. One that keeps the magic
			of the original, that numinous feeling that on the next random page you might find your
			destiny, without the infinite sea of noise. I wanted an ordered Library of Babel.
		</p>

		<p>So we needed a Librarian.</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>The Librarian</h2>
		<p>
			In this Library, between the algorithmic address and the page, there is a Librarian. It's a
			66-million-parameter micro-LLM that we trained ourselves (Claude and I) on 146,000 pages of
			English fiction by authors born in 1880 or later, from Project Gutenberg. Strip an LLM down to
			its essence and it's just a very efficient language compressor; a set of weights that dictate
			probabilities. With a small LLM, we can “order” our Library: bring readable prose closer and
			push meaningless noise away.
		</p>
		<p>
			The Librarian writes as if it rolled a die at every word, a die loaded with those
			probabilities. A page's address is the list of rolls, packed into a single number. When you
			browse, the Librarian unpacks the rolls and writes. When you search, it works out which rolls
			would have written your sentence. Since the Librarian doesn't change, the same rolls always
			give the same page. Every page of your life (and of the one you didn't live) is written at an
			unchanging address in this Library.
		</p>
		<p>
			To roll the die, the line of all numbers is cut into slices, one for each possible word, each
			as wide as its probability. The slice the address falls in is the first word. That slice is
			cut again by the probabilities of the next word, and so on until all 3,200 letters are filled.
			This is arithmetic coding, in a variant called rANS.
		</p>

		<Intervals />

		<p>
			That's why browsing gives you prose instead of noise. A random address almost always falls in
			a wide slice, the slice of a word the Librarian expected, and so on, word after word. The
			noise is still there, in the thinnest of slices. Roughly one in every million random pages is
			pure noise.
		</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>The length of an address</h2>
		<p>
			Each word costs <Log /> bits, where <i>p</i> is its probability. The more predictable the text (by
			our Librarian's taste), the shorter the address. The stranger it is, the longer. A page's address
			is the sum of those costs, so it measures what the Librarian couldn't guess about it.
		</p>
		<p>
			In Basile's Library there is nothing to guess. Each character is one of 29, all equally
			likely, and always costs <Log of="29" minus={false} /> ≈ 4.86 bits, expected or not. A page costs
			3,200 × 4.86 ≈ 15,546 bits, so an address will always have about 3,000 characters. A typical page
			of this new Library costs about 2,300 bits, about 385 characters, almost seven times less. The price
			is that noise costs more here than there.
		</p>

		<Lengths />

		<p>
			You can't give everything a short name, because there aren't enough short names (the
			pigeonhole principle). In Basile's Library every page is equally likely, and every address has
			the same number of bits. We give the short ones to the readable pages and the long ones to the
			noise. All the pages are still there, and the Librarian only decides where each one is. It
			puts them in order.
		</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>The Centre and the Outskirts</h2>
		<p>
			The length of the address tells us something too. It's a distance, which we measure in <i
				>steps</i
			>. A page is as many steps from the centre as its address has bits. That distance depends only
			on the page's text, so it is the same wherever you find it.
		</p>
		<p>
			The Centre is the page the Librarian expects more than any other, the most likely in the whole
			Library.
		</p>
		<p>
			Around it are the rings. <i>The Centre</i> reaches out to 2,016 steps. It's very predictable
			prose, full of repetition. <i>The Neighbourhoods</i> reach to 2,634, and they are pages of
			novels. Almost everything you browse lands here.
			<i>The Outskirts</i>, up to 5,268, have strange names and crooked sentences.
			<i>The Far Reaches</i>, up to 21,072, have stray words among the noise. Beyond them lies
			<i>The Void</i>, which is Basile's Library inside ours.
		</p>

		<Rings />

		<p>
			In Borges's Library, the pages that make sense are rare, lost among the noise. In this one,
			they are near the Centre, and the noise is in the Outskirts.
		</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>Searching for a sentence</h2>
		<p>
			When you search for “I love you”, the Librarian writes, backwards, the text that leads up to
			your sentence (we also trained it to write from right to left), writes forwards what comes
			after it, and takes you to that page's address. That page with that sentence will always exist
			at the same address. The same sentence appears infinitely many times, so we take you to one of
			them, chosen by how likely it is, and always the same one.
		</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>A universe of integers</h2>
		<p>
			The Librarian has to compute exactly the same thing on every device, so that we always find
			the same text at the same address. An address is the exact encoding of a page, so if your
			phone and my laptop disagree on the last decimal of a probability, the same address opens
			different pages. That's why our LLM does all its arithmetic with integers, with 8-bit weights,
			tables for the exponentials and a single rounding rule. On a laptop it writes a page in about
			2 seconds, and the same page anywhere.
		</p>
		<p>
			That way the universe can be frozen. We call this universe babel-en-1 (the Spanish edition's
			is babel-1), and we could make future universes with different tastes. For example, you could
			make an infinite library whose Librarian had been trained on horror stories, where that kind
			of prose would be far more likely.
		</p>

		<p>
			The whole project is pretty light. babel-en-1 weighs 78 MB: 77 of them are the Librarian's
			weights, a little over 1 MB the tables of its vocabulary, and the engine that writes with them
			is 37 KB of code. The city that shows it, without the music, another 250 KB. With that you can
			open any page of a library that doesn't fit in the universe.
		</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>Why</h2>
		<p>Why not?</p>
		<p>
			We are living in an extraordinary era. An era in which a project like this one, which only a
			couple of years ago would have taken several months, can be built in a weekend. The gap
			between an idea and making it real has never been this narrow. The technical barriers that
			kept us from making real everything in our heads are starting to dissolve.
		</p>
		<p>It's time to build.</p>
		<div class="ways">
			<InkLink href={resolve('/en/search')}>Search for a sentence</InkLink>
			<InkLink href={resolve('/en/go')}>Go to an address</InkLink>
		</div>
		{@render credit()}
	</section>
</article>

<style>
	.theory {
		display: flex;
		flex-direction: column;
	}
	h1 {
		margin: 0.3rem 0 1.6rem;
		font: 400 clamp(2rem, 5vw, 2.8rem) / 1.1 var(--display);
		color: var(--ink);
		text-wrap: balance;
	}
	h2 {
		margin: 2.6rem 0 0.6rem;
		font: 400 1.35rem var(--display-sc);
		letter-spacing: 0.12em;
		color: var(--ink);
	}
	p {
		margin: 0 0 1em;
		font-size: 1.12rem;
		line-height: 1.62;
		color: var(--ink-dry);
		hyphens: auto;
	}
	/* the preamble: the promise, before the story of how it is kept */
	.preamble {
		margin: 0 0 2.2rem;
		padding: 0.1rem 0 0.1rem 1.3rem;
		border-left: 2px solid rgba(164, 71, 59, 0.55);
	}
	.preamble p {
		margin: 0;
		font: italic 1.22rem / 1.6 var(--display);
		color: var(--ink-dry);
		text-wrap: pretty;
	}
	.preamble sup {
		font-size: 0.7em;
		font-style: normal;
	}
	.opening::first-letter {
		float: left;
		font-family: var(--display);
		font-size: 3.4em;
		line-height: 0.85;
		padding: 0.06em 0.1em 0 0;
		color: var(--madder);
	}
	sup {
		font-size: 0.68em;
		line-height: 0;
	}
	/* a link out of the city: a small arrow out of a box after it */
	a.out {
		white-space: nowrap;
	}
	a.out svg {
		width: 0.62em;
		height: 0.62em;
		margin-left: 0.18em;
		vertical-align: 0.05em;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.3;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.credit {
		margin: -0.6rem 0 1.6rem;
		font: italic 1rem var(--display);
		color: var(--ink-faint);
	}
	.ways + .credit {
		margin: 2.4rem 0 0;
		text-align: center;
	}
	.ways {
		display: flex;
		gap: 1.6rem;
		justify-content: center;
		margin-top: 0.4rem;
	}
</style>
