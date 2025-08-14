import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(false);
  const [isHydrated, setIsHydrated] = React.useState(false);

  React.useEffect(() => {
    // Mark as hydrated and set initial mobile state
    setIsHydrated(true);
    const initialIsMobile = window.innerWidth < MOBILE_BREAKPOINT;
    setIsMobile(initialIsMobile);

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      const newIsMobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile((prev) => (prev !== newIsMobile ? newIsMobile : prev));
    };

    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Return false during SSR and before hydration to prevent mismatch
  return isHydrated ? isMobile : false;
}
