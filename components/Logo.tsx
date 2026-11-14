import type { SVGProps } from "react";

/**
 * Keystone mark: a keyboard keycap seen from slightly above, with the
 * Return / Enter glyph (⏎) debossed into the top face.
 *
 * Kept as inline SVG rather than an <Image> so it stays crisp at every size
 * and needs no `dangerouslyAllowSVG` in the Next config.
 */
export function Logo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Keystone"
      className={className}
      {...props}
    >
      <defs>
        <path
          id="ks-body"
          d="M160 64H352A96 96 0 0 1 448 160V352A96 96 0 0 1 352 448H160A96 96 0 0 1 64 352V160A96 96 0 0 1 160 64Z"
        />
        <path
          id="ks-face"
          d="M152 88H348A82 82 0 0 1 430 170V346A82 82 0 0 1 348 428H152A82 82 0 0 1 70 346V170A82 82 0 0 1 152 88Z"
        />
        <path
          id="ks-glyph"
          d="M340 182H300V256H250V230L172 279L250 328V302H340Z"
        />
        <clipPath id="ks-face-clip">
          <use href="#ks-face" />
        </clipPath>
      </defs>

      {/* the skirt, a shade darker than the face */}
      <use href="#ks-body" fill="#0089A6" />
      {/* the raised top face */}
      <use href="#ks-face" fill="#00B4D8" />
      {/* the Return glyph, debossed into the face */}
      <g clipPath="url(#ks-face-clip)">
        <use href="#ks-glyph" fill="#007A96" />
      </g>
      {/* chamfer: bright top-left lip, dark bottom-right */}
      <use
        href="#ks-face"
        fill="none"
        stroke="#7FE6FA"
        strokeWidth={5}
        opacity={0.4}
        transform="translate(-2.5,-3)"
      />
      <use
        href="#ks-face"
        fill="none"
        stroke="#00556B"
        strokeWidth={6}
        opacity={0.5}
        transform="translate(3.5,4)"
      />
    </svg>
  );
}
