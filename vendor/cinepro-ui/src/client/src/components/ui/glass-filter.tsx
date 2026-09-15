function buildDisplacementMap(width: number, height: number, radius: number) {
    const inset = 1.68
    const svg = `
        <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="red-grad" x1="100%" y1="0%" x2="0%" y2="0%">
                    <stop offset="0%" stop-color="#0000" />
                    <stop offset="100%" stop-color="red" />
                </linearGradient>
                <linearGradient id="blue-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="#0000" />
                    <stop offset="100%" stop-color="blue" />
                </linearGradient>
            </defs>
            <rect x="0" y="0" width="${width}" height="${height}" fill="black" />
            <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="url(#red-grad)" />
            <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="url(#blue-grad)" style="mix-blend-mode: screen" />
            <rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}" rx="${radius}" fill="hsl(0 0% 50% / 0.93)" style="filter: blur(7px)" />
        </svg>
    `
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function GlassFilter({ id, width, height, radius }: { id: string; width: number; height: number; radius: number }) {
    const map = buildDisplacementMap(width, height, radius)

    // The reference filter used fixed pixel scales (-180/-170/-160) tuned for a small ~48px-tall button.
    // On a short, wide pill those push pixels by several multiples of the element's own height, which is
    // what reads as melty/messy rather than a clean refraction. Scaling to height keeps the displacement
    // proportional (and subtle) regardless of how wide or tall the glass surface ends up being.
    const baseScale = Math.min(40, Math.max(10, height * 0.45))

    return (
        <svg className="pointer-events-none absolute h-0 w-0 overflow-hidden">
            <defs>
                <filter id={id} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
                    <feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" href={map} />

                    <feDisplacementMap in="SourceGraphic" in2="map" result="dispRed" scale={-baseScale} xChannelSelector="R" yChannelSelector="G" />
                    <feColorMatrix in="dispRed" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />

                    <feDisplacementMap in="SourceGraphic" in2="map" result="dispGreen" scale={-baseScale * 0.94} xChannelSelector="R" yChannelSelector="G" />
                    <feColorMatrix in="dispGreen" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green" />

                    <feDisplacementMap in="SourceGraphic" in2="map" result="dispBlue" scale={-baseScale * 0.89} xChannelSelector="R" yChannelSelector="G" />
                    <feColorMatrix in="dispBlue" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue" />

                    <feBlend in="red" in2="green" mode="screen" result="rg" />
                    <feBlend in="rg" in2="blue" mode="screen" result="output" />
                    <feGaussianBlur in="output" stdDeviation="1.1" />
                </filter>
            </defs>
        </svg>
    )
}
