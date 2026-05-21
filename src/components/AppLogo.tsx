import type { SVGProps } from "react";

type AppLogoProps = SVGProps<SVGSVGElement>;

export function AppLogo(props: AppLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      role="img"
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id="app-logo-shell" x1="122" x2="902" y1="92" y2="926" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF8EC" />
          <stop offset=".52" stopColor="#F8E6C8" />
          <stop offset="1" stopColor="#D87543" />
        </linearGradient>
        <linearGradient id="app-logo-surface" x1="238" x2="786" y1="220" y2="792" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFEF8" />
          <stop offset="1" stopColor="#F5EFE1" />
        </linearGradient>
        <linearGradient id="app-logo-sage" x1="276" x2="692" y1="628" y2="318" gradientUnits="userSpaceOnUse">
          <stop stopColor="#90A980" />
          <stop offset="1" stopColor="#D8E4D0" />
        </linearGradient>
        <filter
          id="app-logo-shadow"
          x="76"
          y="74"
          width="872"
          height="884"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feDropShadow dx="0" dy="28" floodColor="#5C421C" floodOpacity=".18" stdDeviation="38" />
        </filter>
      </defs>

      <rect width="1024" height="1024" fill="none" />
      <g filter="url(#app-logo-shadow)">
        <rect x="124" y="112" width="776" height="800" rx="210" fill="url(#app-logo-shell)" />
        <rect x="180" y="168" width="664" height="688" rx="164" fill="#FFFDF8" opacity=".46" />
      </g>

      <rect
        x="250"
        y="286"
        width="524"
        height="448"
        rx="92"
        fill="url(#app-logo-surface)"
        stroke="#243126"
        strokeOpacity=".88"
        strokeWidth="34"
      />
      <circle cx="620" cy="416" r="54" fill="#D87543" />
      <path
        d="M300 668 444 524c25-25 65-24 89 3l62 70 42-42c25-25 66-25 91 1l46 48v130H250v-14c0-20 8-39 22-53l28-27Z"
        fill="url(#app-logo-sage)"
      />
      <path
        d="M250 650 412 508c28-25 71-23 97 4l83 87 36-33c25-23 63-22 87 2l59 59"
        fill="none"
        stroke="#243126"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity=".72"
        strokeWidth="30"
      />

      <path
        d="M744 188c9 62 28 82 90 91-62 9-81 29-90 91-9-62-29-82-91-91 62-9 82-29 91-91Z"
        fill="#FFF7D7"
        stroke="#243126"
        strokeLinejoin="round"
        strokeOpacity=".78"
        strokeWidth="20"
      />
      <path
        d="M270 188c6 39 18 52 57 58-39 6-51 19-57 58-6-39-19-52-58-58 39-6 52-19 58-58Z"
        fill="#D8E4D0"
        stroke="#243126"
        strokeLinejoin="round"
        strokeOpacity=".68"
        strokeWidth="16"
      />

      <circle cx="746" cy="744" r="118" fill="#243126" />
      <path
        d="M692 718c9-53 49-86 102-86 55 0 91 32 91 78 0 38-19 62-66 91l-52 32h116v58H680v-47l105-67c30-19 42-34 42-56 0-21-16-35-39-35-25 0-42 15-48 42l-48-10Z"
        fill="#FFF8EC"
      />
    </svg>
  );
}
