<!--
	The pen's hand, as on the cover: every drawing's edges shifted by a fine noise field (ink-wobble, the cover's
	feTurbulence + feDisplacementMap), or by a coarser one for stains (ink-stain). Defined once, for the whole city.
-->
<svg aria-hidden="true">
	<filter id="ink-wobble" x="-2%" y="-2%" width="104%" height="104%">
		<feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="21" result="n" />
		<feDisplacementMap
			in="SourceGraphic"
			in2="n"
			scale="2.4"
			xChannelSelector="R"
			yChannelSelector="G"
		/>
	</filter>
	<filter id="ink-stain" x="-8%" y="-8%" width="116%" height="116%">
		<feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="3" seed="7" result="n" />
		<feDisplacementMap
			in="SourceGraphic"
			in2="n"
			scale="14"
			xChannelSelector="R"
			yChannelSelector="G"
			result="d"
		/>
		<feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="3" result="f" />
		<feDisplacementMap in="d" in2="f" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
	</filter>
</svg>

<style>
	svg {
		position: absolute;
		width: 0;
		height: 0;
	}
</style>
