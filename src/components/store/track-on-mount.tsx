"use client";

import { useEffect } from "react";
import { track } from "./analytics";

/** Fires one analytics event when rendered (e.g. product_view, search). */
export function TrackOnMount({ event }: { event: Parameters<typeof track>[0] }) {
  const key = JSON.stringify(event);
  useEffect(() => {
    track(JSON.parse(key));
  }, [key]);
  return null;
}
