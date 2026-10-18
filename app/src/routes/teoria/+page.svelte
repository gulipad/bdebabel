<script lang="ts">
	/** Teoría: the article. How the Library works, from Borges to the librarian, with its drawings. */
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
	<title>Teoría · La Biblioteca de Babel</title>
	<meta
		name="description"
		content="Cómo funciona la Biblioteca: de Borges a Basile, y de Basile a un Bibliotecario que sabe español."
	/>
</svelte:head>

{#snippet credit()}
	<p class="credit">
		Hecho con ❤️ por <a
			class="out"
			href="https://gulipad.com"
			target="_blank"
			rel="noopener noreferrer"
			>Gulipad<svg viewBox="0 0 12 12" aria-hidden="true"
				><path d="M5 2.5H2.5v7h7V7 M7 2.5h2.5V5 M9.5 2.5 5.5 6.5" /></svg
			><span class="sr">(se abre en otra pestaña)</span></a
		>
	</p>
{/snippet}

<article class="theory">
	<h1>La Biblioteca Infinita</h1>
	{@render credit()}

	<p class="opening">
		En 1938, Jorge Luis Borges entra a trabajar como auxiliar en la Biblioteca Municipal Miguel
		Cané, en Buenos Aires. Tres años después publica, dentro de <i
			>El jardín de senderos que se bifurcan</i
		>, un cuento de pocas páginas sobre una biblioteca que contiene todos los libros posibles.
	</p>
	<p>
		En el cuento, la biblioteca es el universo entero, una sucesión de galerías hexagonales sin
		principio ni fin. Cada sala tiene cuatro muros de cinco baldas con 32 libros cada una, y cada
		libro tiene 410 páginas de 40 renglones de 80 letras, escritas con 25 símbolos. No hay dos
		libros iguales, porque están todos los posibles.
	</p>

	<Anatomy />

	<p>
		Y son muchísimos. Un libro de Borges tiene 1.312.000 caracteres, así que hay 25<sup
			>1.312.000</sup
		>
		libros distintos, un 1 seguido de más de 1.800.000 ceros. En alguno está tu biografía, en otros todas
		sus versiones falsas y la refutación de cada una, además del catálogo de la Biblioteca y de miles
		de catálogos equivocados.
	</p>
	<p>
		Casi todo, eso sí, es ruido. Los bibliotecarios del cuento pasan la vida recorriendo galerías
		para encontrar, con suerte, una línea con sentido.
	</p>

	<section use:melt={{ onView: true }}>
		<h2>La Biblioteca de Basile</h2>
		<p>
			En 2015, Jonathan Basile la construyó. En <a
				class="out"
				href="https://libraryofbabel.info"
				target="_blank"
				rel="noopener noreferrer"
				>libraryofbabel.info<svg viewBox="0 0 12 12" aria-hidden="true"
					><path d="M5 2.5H2.5v7h7V7 M7 2.5h2.5V5 M9.5 2.5 5.5 6.5" /></svg
				><span class="sr">(se abre en otra pestaña)</span></a
			>
			están todas las páginas posibles de 3.200 caracteres con 29 símbolos (las letras, el espacio, la
			coma y el punto). Son 29<sup>3.200</sup>, unas 10<sup>4.680</sup> páginas, cuando en el
			universo observable hay unos 10<sup>80</sup> átomos.
		</p>
		<p>
			No están guardadas en ningún sitio, porque no cabrían. Cada página ocupa unos 2 KB, así que
			harían falta unos 10<sup>4.683</sup> bytes. Si cada átomo del universo fuera un disco de 1
			petabyte, cabrían 10<sup>95</sup> bytes. Si cada uno de esos átomos fuera a su vez un universo lleno
			de discos, y así sucesivamente, harían falta 59 universos, uno dentro de otro.
		</p>

		<Nesting />

		<p>
			Lo que Basile programó es una función que convierte una dirección (sala, muro, balda, libro,
			página) en una página, y que se puede deshacer. Abrir una página es aplicar la función, y
			buscar un texto es aplicarla al revés.
		</p>

		<Bijection />

		<p>
			Si abres una página al azar te encuentras algo como «xqkfm, ehu.rpz lw», y así casi siempre.
			La probabilidad de que una página al azar empiece por una frase concreta de 30 letras es de 1
			entre 10<sup>44</sup>.
		</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>El Bibliotecario</h2>
		<p>
			En esta Ciudad, entre la dirección y la página hay un Bibliotecario. Es un modelo de lenguaje
			de 66 millones de parámetros que hemos entrenado nosotros (Claude y yo) con 83.177 páginas de
			novelas y ensayos en español - cada una, 16 veces. Se llama librarian-1, y dado un texto
			calcula la probabilidad de cada palabra que podría venir después.
		</p>
		<p>
			El Bibliotecario escribe como si tirara un dado en cada palabra, un dado trucado con esas
			probabilidades. La dirección de una página es la lista de tiradas, empaquetada en un solo
			número. Al hojear, el Bibliotecario desempaqueta las tiradas y escribe. Al buscar, calcula qué
			tiradas habrían escrito tu frase. Como el Bibliotecario no cambia, las mismas tiradas dan
			siempre la misma página.
		</p>
		<p>
			El dado funciona así. La línea de todos los números se corta en rodajas, una por cada palabra
			posible, cada una tan ancha como su probabilidad. La rodaja en la que cae la dirección es la
			primera palabra. Esa rodaja se vuelve a cortar con las probabilidades de la palabra siguiente,
			y así hasta llenar las 3.200 letras. Es codificación aritmética, en una variante llamada rANS.
		</p>

		<Intervals />
	</section>

	<section use:melt={{ onView: true }}>
		<h2>La longitud de una dirección</h2>
		<p>
			Cada palabra cuesta <Log /> bits, donde <i>p</i> es su probabilidad. La palabra que el Bibliotecario
			veía venir cuesta casi nada, y la que no se esperaba cuesta mucho. La dirección de una página es
			la suma de esos costes, así que mide lo que el Bibliotecario no podía adivinar de ella. Shannon
			demostró en 1948 que, de media, no se puede hacer más corta.
		</p>
		<p>
			En la Biblioteca de Basile no hay nada que adivinar. Cada carácter es uno de 29, igual de
			probable, y cuesta siempre <Log of="29" minus={false} /> ≈ 4,86 bits, se espere o no. Una página
			cuesta 3.200 × 4,86 ≈ 15.546 bits, unos 3.000 caracteres de dirección. Una página típica de esta
			Biblioteca cuesta unos 2.300 bits, unos 390 caracteres, ocho veces menos. El ruido, en cambio, aquí
			sale más caro que allí.
		</p>

		<Lengths />

		<p>
			No se le puede dar un nombre corto a todo, porque no hay suficientes nombres cortos (el
			principio del palomar). Basile reparte los nombres por igual. Nosotros damos los cortos a las
			páginas legibles y los largos al ruido.
		</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>El Centro y Las Afueras</h2>
		<p>
			La longitud de la dirección es también una distancia, que medimos en <i>pasos</i>. Una página
			está a tantos pasos del centro como bits tiene su dirección. Esa distancia depende sólo del
			texto de la página, así que es la misma en cualquier sitio donde la encuentres.
		</p>
		<p>
			El Centro existe, a 0 pasos. Es la página que el Bibliotecario espera más que ninguna, la más
			probable de toda la Biblioteca.
		</p>
		<p>
			Alrededor están los anillos. <i>El Centro</i> llega hasta 2.078 pasos, con prosa muy
			previsible y repeticiones. <i>Los Barrios</i> llegan hasta 2.820 y son páginas de novela,
			donde cae casi todo lo que hojeas. <i>Las Afueras</i>, hasta 5.640, tienen nombres raros y
			frases torcidas.
			<i>Los Confines</i>, hasta 22.560, tienen palabras sueltas entre ruido. Más allá está
			<i>El Vacío</i>, que es la Biblioteca de Basile dentro de la nuestra.
		</p>

		<Rings />

		<p>
			En la Biblioteca de Borges, las páginas con sentido son rarísimas y están perdidas entre el
			ruido. En esta, están cerca de El Centro, y el ruido está en Las Afueras.
		</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>Buscar una frase</h2>
		<p>
			Cuando buscas «te quiero», el Bibliotecario escribe hacia atrás el texto que lleva hasta tu
			frase (también lo entrenamos para escribir de derecha a izquierda), escribe hacia delante lo
			que viene después y te lleva a la dirección de esa página, que es una dirección como cualquier
			otra. La misma frase lleva siempre a la misma página primero, y desde ahí puedes pedir otras.
		</p>
		<p>
			En una prueba, «te quiero» salió a 2.126 pasos del centro, en mitad de una discusión:
			«—Háblame, yo te quiero; te amo, te he amado mucho.»
		</p>
		<p>
			Las copias son inevitables. Una biblioteca que reparte las páginas según su probabilidad, y
			que tiene una página en cada dirección, tiene que repetirlas. Cada página aparece infinitas
			veces, más cuanto más probable es. El narrador de Borges insiste en que no hay dos libros
			iguales, y en eso la Biblioteca de Basile se parece más a la suya que la nuestra.
		</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>Un universo de números enteros</h2>
		<p>
			El Bibliotecario tiene que calcular exactamente lo mismo en todos los dispositivos. Una
			dirección es la codificación exacta de una página, así que si tu móvil y mi portátil discrepan
			en el último decimal de una probabilidad, la misma dirección abre páginas distintas, y con
			decimales los dispositivos discrepan. Por eso librarian-1 hace toda su aritmética con números
			enteros, con pesos de 8 bits, tablas para las exponenciales y una sola regla de redondeo. En
			un portátil escribe una página en unos 2 segundos, y la misma página en cualquier sitio.
		</p>
		<p>
			Así el universo se puede congelar. babel-1 es una lista de números (los pesos del
			Bibliotecario, sus reglas de lectura y una clave), y si cambiamos uno solo, las páginas
			cambian de sitio. Por eso cada dirección empieza por el nombre de su universo, y los universos
			no se tocan.
		</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>Lo que se pierde</h2>
		<p>
			Se pierde algo de vértigo. En la Biblioteca de Basile, una frase con sentido es un milagro, y
			aquí aparece en cada página, con la sensación inquietante de que alguien la escribió. Se
			pierde neutralidad, porque el Bibliotecario tiene sus gustos (los de alguien que ha leído
			sobre todo prosa del siglo XIX) y nosotros tenemos los nuestros. Y cada página deja de ser
			única.
		</p>
		<p>
			A cambio, una página al azar se puede leer, y una búsqueda pone tu frase en mitad de la
			historia de otro, con alguien que le contesta.
		</p>
		<div class="ways">
			<InkLink href={resolve('/buscar')}>Buscar una frase</InkLink>
			<InkLink href={resolve('/ir')}>Ir a una dirección</InkLink>
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
