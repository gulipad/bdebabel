<script lang="ts">
	/** Teoría: the article. How the Library works, from Borges to the librarian, with its drawings. */
	import { resolve } from '$app/paths';
	import Anatomy from '#lib/theory/Anatomy.svelte';
	import Bijection from '#lib/theory/Bijection.svelte';
	import Intervals from '#lib/theory/Intervals.svelte';
	import Lengths from '#lib/theory/Lengths.svelte';
	import Nesting from '#lib/theory/Nesting.svelte';
	import Rings from '#lib/theory/Rings.svelte';
	import InkLink from '#lib/ui/InkLink.svelte';
	import { melt } from '#lib/ui/melt.ts';
</script>

<svelte:head>
	<title>Teoría · La Biblioteca de Babel</title>
	<meta
		name="description"
		content="Cómo funciona la Biblioteca: de Borges a Basile, y de Basile a un bibliotecario que sabe español."
	/>
</svelte:head>

<article class="theory">
	<p class="kicker">Teoría</p>
	<h1>Una biblioteca que sabe leer</h1>

	<p class="opening">
		En 1938, Jorge Luis Borges entra a trabajar como auxiliar en la Biblioteca Municipal Miguel
		Cané, en Buenos Aires. Un trabajo de catalogar libros, con muchas horas muertas. Tres años
		después publica, dentro de <i>El jardín de senderos que se bifurcan</i>, un cuento de pocas
		páginas sobre una biblioteca que lo contiene todo.
	</p>
	<p>
		La biblioteca del cuento es el universo entero. Galerías hexagonales, una tras otra, sin
		principio ni fin. Cada sala tiene cuatro muros con cinco baldas, cada balda 32 libros, y cada
		libro 410 páginas de 40 renglones de 80 letras, escritas con 25 símbolos. No hay dos libros
		iguales. Están todos los posibles.
	</p>

	<Anatomy />

	<p>
		Todos los posibles son muchos. Un libro de Borges tiene 1.312.000 caracteres, así que hay 25<sup
			>1.312.000</sup
		> libros distintos - un 1 seguido de más de 1.800.000 ceros. Ahí está tu biografía, la verdadera y
		todas las falsas. La refutación de cada una. El catálogo de la Biblioteca, y miles de catálogos equivocados.
	</p>
	<p>
		El problema es que casi todo es ruido. Los bibliotecarios del cuento pasan la vida recorriendo
		galerías para encontrar, con suerte, una línea con sentido. La Biblioteca lo tiene todo, y
		precisamente por eso no dice nada.
	</p>

	<section use:melt={{ onView: true }}>
		<h2>La Biblioteca de Basile</h2>
		<p>
			En 2015, Jonathan Basile hizo algo que parecía imposible. La construyó. En <a
				class="out"
				href="https://libraryofbabel.info"
				target="_blank"
				rel="noopener noreferrer"
				>libraryofbabel.info<svg viewBox="0 0 12 12" aria-hidden="true"
					><path d="M5 2.5H2.5v7h7V7 M7 2.5h2.5V5 M9.5 2.5 5.5 6.5" /></svg
				><span class="sr">(se abre en otra pestaña)</span></a
			>
			están todas las páginas posibles de 3.200 caracteres con 29 símbolos (las letras, el espacio, la
			coma y el punto). Son 29<sup>3.200</sup>, unas 10<sup>4.680</sup> páginas. Para hacerse una
			idea, en el universo observable hay unos 10<sup>80</sup> átomos.
		</p>
		<p>
			Obviamente no están guardadas en ningún sitio, porque no cabrían. Cada página ocupa unos 2 KB,
			así que harían falta unos 10<sup>4.683</sup> bytes. Si cada átomo del universo fuera un disco
			de 1 petabyte, el universo entero guardaría 10<sup>95</sup> bytes - no llega ni de lejos. Si cada
			uno de esos átomos fuera a su vez un universo lleno de discos, y cada átomo de esos otro universo,
			y así sucesivamente, harían falta 59 universos, uno dentro de otro.
		</p>

		<Nesting />

		<p>
			El truco es aritmético, una función que convierte una dirección (sala, muro, balda, libro,
			página) en una página y que se puede deshacer. Abrir es aplicarla. Buscar es deshacerla.
		</p>

		<Bijection />

		<p>
			Es precioso. Y es el cuento de Borges llevado al pie de la letra - abres una página al azar y
			te encuentras «xqkfm, ehu.rpz lw». Te lo vas a encontrar siempre. La probabilidad de que una
			página al azar empiece por una frase concreta de 30 letras es de 1 entre 10<sup>44</sup>.
		</p>
		<p class="beat">¿Y si la Biblioteca supiera español?</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>El bibliotecario</h2>
		<p>
			Esa es la idea de esta Ciudad. En vez de una función que trata todas las letras por igual,
			ponemos en medio a un bibliotecario. Es un modelo de lenguaje que hemos entrenado nosotros, de
			66 millones de parámetros, que leyó 83.177 páginas de novelas y ensayos en español - 16 veces
			cada una. Se llama librarian-1, y su único talento es adivinar. Dado un texto, dice qué
			probabilidad tiene cada palabra de venir después.
		</p>
		<p>
			Con eso basta. Imagina que el bibliotecario escribe tirando un dado en cada palabra, un dado
			trucado con sus probabilidades. La dirección de una página es la lista de tiradas, empaquetada
			en un solo número. Hojear es desempaquetar las tiradas y dejarle escribir. Buscar es
			preguntarle, palabra a palabra, qué tirada habría escrito tu frase. Mismas tiradas, misma
			página, para siempre, porque el bibliotecario no cambia.
		</p>
		<p>
			Por dentro, el dado es una regla. La línea de todos los números se corta en rodajas, una por
			cada palabra posible, cada una tan ancha como su probabilidad. La rodaja en la que cae la
			dirección es la primera palabra. Esa rodaja se vuelve a cortar con las probabilidades de la
			siguiente, y así hasta llenar las 3.200 letras (es la codificación aritmética de toda la vida
			- en nuestro caso, una variante llamada rANS).
		</p>

		<Intervals />

		<p class="beat">El azar no vive en el modelo. Vive en la dirección.</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>Lo que cuesta una página</h2>
		<p>
			De aquí sale lo más bonito del proyecto. Cada palabra cuesta −log₂ p bits. La que el
			bibliotecario veía venir cuesta casi nada, la que no se esperaba cuesta mucho. La dirección de
			una página es la suma, y mide exactamente lo que el bibliotecario no podía adivinar de ella
			(Shannon demostró en 1948 que no se puede hacer más corta).
		</p>
		<p>
			Una página típica de esta Biblioteca cuesta unos 2.300 bits, unos 390 caracteres de dirección.
			En la de Basile cualquier página cuesta lo mismo, unos 15.500 bits - unos 3.000 caracteres.
			Ocho veces más. Y el ruido, aquí, sale todavía más caro que allí.
		</p>

		<Lengths />

		<p>
			No es gratis, claro. No se le puede dar un nombre corto a todo, porque no hay suficientes
			nombres cortos (el principio del palomar). Basile reparte los nombres por igual. Nosotros
			gastamos los cortos en lo que se lee, y dejamos los largos para el ruido.
		</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>El centro y las afueras</h2>
		<p>
			Si la dirección mide la sorpresa, también mide una distancia. La llamamos <i>pasos</i>. Una
			página está a tantos pasos del centro como bits tiene su dirección, y la distancia es de la
			página, no del sitio donde la encuentres.
		</p>
		<p>
			El centro existe. Está en <a
				class="address"
				href={resolve('/[address]', { address: 'babel-1:0:1:1:1:1' })}>babel-1:0:1:1:1:1</a
			>, a 0 pasos, y es la página que el bibliotecario espera más que ninguna. Empieza así, «—No,
			no, no —dijo el señor Bergeret—. Es una historia muy larga, y no me gusta.» Y sigue, durante
			toda la página, con «—No, no es una historia muy larga.» El centro de una biblioteca que lo
			contiene todo es un señor diciendo que no (Bergeret, por cierto, es un personaje de Anatole
			France que el bibliotecario se trajo de sus lecturas).
		</p>
		<p>
			Alrededor, los anillos. <i>El centro</i> llega hasta 2.078 pasos, con prosa muy previsible y
			repeticiones. <i>Los barrios</i>, hasta 2.820, son páginas de novela - ahí cae casi todo lo
			que hojeas. <i>Las afueras</i>, hasta 5.640, traen nombres raros y frases torcidas.
			<i>Los confines</i>, hasta 22.560, palabras sueltas entre ruido. Y más allá está
			<i>el vacío</i>, la Biblioteca de Basile dentro de la nuestra.
		</p>

		<Rings />

		<p class="beat">Es Borges al revés.</p>
		<p>
			En su Biblioteca, el sentido es un milagro perdido entre el ruido. En esta, el sentido es lo
			normal, cerca del centro, y el ruido vive en las afueras.
		</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>Buscar es hojear al revés</h2>
		<p>
			Hojear y buscar son dos lecturas del mismo mapa. Cuando buscas «te quiero», el bibliotecario
			no se inventa una página para ti. Escribe hacia atrás el texto que lleva hasta tu frase (lo
			entrenamos también a escribir de derecha a izquierda), escribe hacia delante lo que viene
			después, y te lleva a la dirección de esa página. Una dirección normal, entre todas las demás.
			No hay una sala especial para ti.
		</p>
		<p>
			En una prueba, «te quiero» salió a 2.126 pasos del centro, en mitad de una discusión
			(«—Háblame, yo te quiero; te amo, te he amado mucho.»). Tu frase ya estaba escrita. Sólo había
			que encontrar la balda.
		</p>
		<p>
			Hay un detalle raro, e inevitable, que son las copias. Una biblioteca que reparte las páginas
			según su probabilidad, y que tiene una página en cada dirección, tiene que repetirlas. Cada
			página aparece infinitas veces, más cuanto más probable es. El narrador de Borges insiste en
			que no hay dos libros iguales. En eso, Basile le hace más caso que nosotros.
		</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>Un universo de números enteros</h2>
		<p>
			Para que todo esto funcione, el bibliotecario tiene que calcular exactamente lo mismo en todos
			los dispositivos. Una dirección es la codificación exacta de una página, así que si tu móvil y
			mi portátil discrepan en el último decimal de una probabilidad, la misma dirección abre
			páginas distintas. Y con decimales, discrepan. Por eso librarian-1 hace toda su aritmética con
			números enteros - pesos de 8 bits, tablas para las exponenciales, una sola regla de redondeo.
			En un portátil escribe una página en unos 2 segundos, y la misma página en cualquier sitio.
		</p>
		<p>
			Eso convierte el universo en algo que se puede congelar. babel-1 es una lista de números (los
			pesos del bibliotecario, sus reglas de lectura y una clave). Si cambiamos uno solo, las
			páginas se mudan. Por eso cada dirección empieza por el nombre de su universo, y los universos
			no se tocan.
		</p>
	</section>

	<section use:melt={{ onView: true }}>
		<h2>Lo que se pierde y lo que se gana</h2>
		<p>
			Se pierde vértigo. En la Biblioteca de Basile, una frase con sentido es un milagro. Aquí el
			sentido está por todas partes, y lo inquietante es otra cosa, la sensación de que alguien
			escribió esto. Se pierde neutralidad, porque el bibliotecario tiene sus gustos (un poco del
			siglo XIX, para ser sinceros) y nosotros los nuestros. Y se pierde la unicidad.
		</p>
		<p>
			A cambio, hojear merece la pena. Una página al azar puede contarte algo. Buscar es inquietante
			de la mejor manera - tu frase dentro de la historia de otro, en mitad de una escena, con
			alguien contestándole. Las direcciones son ocho veces más cortas. Y está en español, la lengua
			de Borges.
		</p>
		<p class="beat">La Biblioteca está abierta. Elige un muro.</p>
		<div class="ways">
			<InkLink href={resolve('/buscar')}>Buscar una frase</InkLink>
			<InkLink href={resolve('/hojear')}>Hojear</InkLink>
		</div>
	</section>
</article>

<style>
	.theory {
		display: flex;
		flex-direction: column;
	}
	.kicker {
		margin: 0;
		font: 0.95rem var(--display-sc);
		letter-spacing: 0.2em;
		color: var(--ink-faint);
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
	.beat {
		font: italic 1.45rem/1.35 var(--display);
		color: var(--ink);
		margin: 0.6em 0 1em;
		text-wrap: balance;
	}
	sup {
		font-size: 0.68em;
		line-height: 0;
	}
	a.address {
		font-family: var(--mono);
		font-size: 0.9em;
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
	.ways {
		display: flex;
		gap: 1.6rem;
		justify-content: center;
		margin-top: 0.4rem;
	}
</style>
