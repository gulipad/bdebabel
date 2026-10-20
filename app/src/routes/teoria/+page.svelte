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
	import { page } from '$app/state';
	import TextEditor from '#lib/dev/TextEditor.svelte';
	import { melt } from '#lib/ui/melt.ts';

	// a temporary editor, on the dev server only (?editar): see lib/dev/TextEditor.svelte
	const editing = import.meta.env.DEV && page.url.searchParams.has('editar');
	let article = $state<HTMLElement>();
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
		Construido con ❤️ por <a
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

<article class="theory" bind:this={article}>
	<h1>La Biblioteca Infinita</h1>

	<blockquote class="preamble">
		<p>
			Todo está escrito aquí. Todo lo que te ha ocurrido, todo lo que has pensado, todo lo que has
			hecho. También todo lo que no. Esta Biblioteca contiene - en sentido literal - toda
			combinación posible de 3.200 caracteres, unas 10<sup>7.113</sup> páginas. Si pasaras infinitas eternidades
			buscando páginas aleatorias, encontrarías aquí la historia de tu vida entera. Todo texto que encuentres
			estará siempre en la misma dirección. Aquí te cuento cómo funciona.
		</p>
	</blockquote>

	<p class="opening">
		En 1938, Jorge Luis Borges entra a trabajar como auxiliar en la Biblioteca Municipal Miguel
		Cané, en Buenos Aires. Allí pasa largas jornadas, entre torres de madera de cedro, custodias de
		los libros que inspirarían quizás su obra futura. Cataloga tan deprisa que sus compañeros le
		piden que vaya más despacio, para no quedar mal ellos, así que despacha el trabajo en una hora y
		pasa el resto del día leyendo y escribiendo en el sótano. Tres años después publica, dentro de <i
			>El jardín de senderos que se bifurcan</i
		>, un cuento de pocas páginas sobre una biblioteca que contiene todos los libros posibles. «La
		biblioteca de Babel».
	</p>
	<p>
		En el cuento, la Biblioteca es el universo entero: una sucesión de galerías hexagonales sin
		principio ni fin. Cada sala tiene cuatro muros de cinco baldas con 32 libros cada una, y cada
		libro 410 páginas de 40 renglones de 80 letras, escritas con 25 símbolos. No hay dos libros
		iguales, porque están todos los posibles.
	</p>

	<Anatomy />

	<p>
		Y son muchísimos, aunque no infinitos. Un libro de Borges tiene 1.312.000 caracteres, así que
		hay 25<sup>1.312.000</sup> libros distintos, un 1 seguido de más de 1.800.000 ceros. En alguno está
		tu biografía, en otros todas sus versiones falsas y la refutación de cada una.
	</p>
	<p>
		Casi todo, eso sí, es ruido. Los bibliotecarios del cuento pasan la vida recorriendo galerías
		para encontrar, con suerte, un verso con sentido.
	</p>

	<section use:melt={{ onView: true }}>
		<h2>La Biblioteca de Basile</h2>
		<p>
			Existe en internet un rincón muy especial, uno de mis favoritos de la web, construido por
			Jonathan Basile en 2015. En <a
				class="out"
				href="https://libraryofbabel.info"
				target="_blank"
				rel="noopener noreferrer"
				>libraryofbabel.info<svg viewBox="0 0 12 12" aria-hidden="true"
					><path d="M5 2.5H2.5v7h7V7 M7 2.5h2.5V5 M9.5 2.5 5.5 6.5" /></svg
				><span class="sr">(se abre en otra pestaña)</span></a
			>
			están todas las páginas posibles de 3.200 caracteres con 29 símbolos (las letras, el espacio, la
			coma y el punto). Son 29<sup>3.200</sup>, unas 10<sup>4.680</sup> páginas. No están guardadas en
			ningún sitio, porque no cabrían.
		</p>
		<p>
			En el universo observable hay unos 10<sup>80</sup> átomos. Cada página ocupa unos 2 KB, así
			que harían falta unos 10<sup>4.683</sup> bytes. Si cada átomo del universo fuera un disco de 1
			petabyte, cabrían 10<sup>95</sup> bytes. Si cada átomo de ese universo fuera a su vez otro universo,
			necesitaríamos encadenar 59 universos uno dentro de otro sólo para poder guardar esta Biblioteca.
			Son números absurdamente grandes.
		</p>

		<Nesting />

		<p>
			Lo que Basile programó es una función reversible que convierte una dirección (sala, muro,
			balda, libro, página) en una página. Abrir una página es aplicar la función, y buscar un texto
			es aplicarla al revés.
		</p>

		<Bijection />

		<p>
			Pero la Biblioteca de Basile tiene un problema. Si abres una página al azar, existe una
			probabilidad prácticamente cierta de que sólo encuentres ruido. Una sopa de letras aleatorias.
			La posibilidad de que una página al azar empiece por una frase concreta de 30 letras es de 1
			entre 10<sup>44</sup>.
		</p>

		<p>
			En homenaje a Borges y a Basile, he querido construir una biblioteca nueva. Una que mantenga
			la magia de la original, esa sensación numinosa de que en la próxima página aleatoria podrías
			encontrar tu destino, pero no en un mar infinito de ruido. Quiero una Biblioteca de Babel
			ordenada.&nbsp;
		</p>

		<p>Necesitamos, pues, un Bibliotecario.</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>El Bibliotecario</h2>
		<p>
			En esta Biblioteca, entre la dirección algorítmica y la página existe un Bibliotecario. Es un
			micro-LLM de 66 millones de parámetros que hemos entrenado nosotros (Claude y yo) con 83.177
			páginas de novelas y ensayos en español. Un LLM, en su más pura esencia, no es más que una
			manera muy eficiente de comprimir el lenguaje, con pesos que dictan probabilidades. Podemos,
			con un LLM pequeño, «ordenar» nuestra Biblioteca: acercar la prosa legible y alejar el ruido
			sin sentido.
		</p>
		<p>
			El Bibliotecario escribe como si tirara un dado en cada palabra, un dado trucado con esas
			probabilidades. La dirección de una página es la lista de tiradas, empaquetada en un solo
			número. Al hojear, el Bibliotecario desempaqueta las tiradas y escribe. Al buscar, calcula qué
			tiradas habrían escrito tu frase. Como el Bibliotecario no cambia, las mismas tiradas dan
			siempre la misma página. Cada página de tu vida (y de la que no viviste) está escrita en una
			dirección inmutable de esta Biblioteca.
		</p>
		<p>
			El dado funciona así. La línea de todos los números se corta en rodajas, una por cada palabra
			posible, cada una tan ancha como su probabilidad. La rodaja en la que cae la dirección es la
			primera palabra. Esa rodaja se vuelve a cortar con las probabilidades de la palabra siguiente,
			y así hasta llenar las 3.200 letras. Es codificación aritmética, en una variante llamada rANS.
		</p>

		<Intervals />

		<p>
			Por eso al hojear sale prosa en lugar de ruido. Una dirección al azar cae casi siempre en una
			rodaja ancha, la de una palabra que el Bibliotecario esperaba, y así palabra tras palabra. El
			ruido sigue ahí, en rodajas finísimas; más o menos una de cada millón de páginas al azar es
			ruido puro.
		</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>La longitud de una dirección</h2>
		<p>
			Cada palabra cuesta <Log /> bits, donde <i>p</i> es su probabilidad. Cuanto más predecible es el
			texto (según los gustos de nuestro Bibliotecario), más corta es la dirección. Cuanto más extraño,
			más larga es. La dirección de una página es la suma de esos costes, así que mide lo que el Bibliotecario
			no podía adivinar de ella.
		</p>
		<p>
			En la Biblioteca de Basile no hay nada que adivinar. Cada carácter es uno de 29, igual de
			probable, y cuesta siempre <Log of="29" minus={false} /> ≈ 4,86 bits, se espere o no. Una página
			cuesta 3.200 × 4,86 ≈ 15.546 bits, unos 3.000 caracteres de dirección. Una página típica de esta
			Biblioteca cuesta unos 2.300 bits, unos 390 caracteres, casi siete veces menos. Pero hay un precio
			a pagar: el ruido aquí sale más caro que allí.
		</p>

		<Lengths />

		<p>
			No se le puede dar un nombre corto a todo, porque no hay suficientes nombres cortos (el
			principio del palomar). En la Biblioteca de Basile, cada página tiene la misma probabilidad, y
			cada dirección los mismos bits. Nosotros damos los cortos a las páginas legibles y los largos
			al ruido. Siguen estando todas las páginas, y el Bibliotecario sólo decide dónde está cada
			una. Ordena.
		</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>El Centro y Las Afueras</h2>
		<p>
			La longitud de la dirección también nos da información. Es una distancia, que medimos en <i
				>pasos</i
			>. Una página está a tantos pasos del centro como bits tiene su dirección. Esa distancia
			depende sólo del texto de la página, así que es la misma en cualquier sitio donde la
			encuentres.
		</p>
		<p>
			El Centro es la página que el Bibliotecario espera más que ninguna, la más probable de toda la
			Biblioteca.
		</p>
		<p>
			Alrededor están los anillos. <i>El Centro</i> llega hasta 2.078 pasos. Es prosa muy previsible
			y con repeticiones. <i>Los Barrios</i> llegan hasta 2.820 y son páginas de novela. Aquí cae
			casi todo lo que hojeas.
			<i>Las Afueras</i>, hasta 5.640, tienen nombres raros y frases torcidas. <i>Los Confines</i>,
			hasta 22.560, tienen palabras sueltas entre ruido. Más allá está <i>El Vacío</i>, que es la
			Biblioteca de Basile dentro de la nuestra.
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
			otra. Esa página con esa frase existirá siempre en la misma dirección. La misma frase está
			presente infinitas veces, así que te llevamos a una de ellas, elegida según lo probable que
			es, y siempre a la misma.
		</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>Un universo de números enteros</h2>
		<p>
			El Bibliotecario tiene que calcular exactamente lo mismo en todos los dispositivos, para que
			siempre encontremos el mismo texto en la misma dirección. Una dirección es la codificación
			exacta de una página, así que si tu móvil y mi portátil discrepan en el último decimal de una
			probabilidad, la misma dirección abre páginas distintas, y con decimales los dispositivos
			discrepan. Por eso nuestro LLM hace toda su aritmética con números enteros, con pesos de 8
			bits, tablas para las exponenciales y una sola regla de redondeo. En un portátil escribe una
			página en unos 2 segundos, y la misma página en cualquier sitio.
		</p>
		<p>
			Así el universo se puede congelar. El modelo es una lista de números (los pesos del
			Bibliotecario, sus reglas de lectura y una clave), y si cambiamos uno solo, las páginas
			cambian de sitio. Por eso cada dirección empieza por el nombre de su universo, y los universos
			no se tocan. Ahora mismo ese universo lo llamamos babel-1, y podríamos hacer universos futuros
			con gustos diferentes. Por ejemplo, se podría hacer una biblioteca infinita cuyo Bibliotecario
			hubiera sido entrenado con novela de terror, que mostraría este tipo de prosa con una
			probabilidad mucho mayor.
		</p>

		<p>
			El proyecto es bastante ligero. babel-1 pesa 78 MB: 77 son los pesos del Bibliotecario, algo
			más de 1 MB las tablas de su vocabulario, y el motor que escribe con ellos son 37 KB de
			código. La ciudad que lo enseña, sin la música, otros 250 KB. Con eso se abre cualquier página
			de una biblioteca que no cabe en el universo.
		</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>Por qué</h2>
		<p>¿Por qué no?</p>
		<p>
			Vivimos una era extraordinaria. Una era en la que un proyecto como este, que hace sólo un par
			de años habría llevado 4 meses, se puede construir en un fin de semana. La brecha entre la
			idea y la creación nunca ha sido tan estrecha. Las barreras técnicas que nos impedían hacer
			realidad todo lo que surge de nuestra cabeza empiezan a disolverse.
		</p>
		<p>Es hora de construir.</p>
		<div class="ways">
			<InkLink href={resolve('/buscar')}>Buscar una frase</InkLink>
			<InkLink href={resolve('/ir')}>Ir a una dirección</InkLink>
		</div>
		{@render credit()}
	</section>
</article>
{#if editing && article}<TextEditor root={article} name="teoria" />{/if}

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
