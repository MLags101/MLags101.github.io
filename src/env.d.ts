/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Set by the project page so MDX components can resolve co-located images by name. */
    projectSlug?: string;
  }
}
