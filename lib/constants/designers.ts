/**
 * Centralized configuration for designers
 * This file contains the list of all active designers in the system
 * 
 * When adding a new designer:
 * 1. Add the name to the DESIGNERS array
 * 2. The name will automatically be used in:
 *    - Mockups & Alterações section
 *    - Designer statistics
 *    - All designer-related components
 */

export const DESIGNERS = ["Vitor", "Felipe", "Pedro"] as const;

export type Designer = typeof DESIGNERS[number];

/**
 * Get all designers as an array
 */
export function getAllDesigners(): string[] {
  return [...DESIGNERS];
}

/**
 * Check if a name is a valid designer
 */
export function isValidDesigner(name: string): boolean {
  return DESIGNERS.includes(name as Designer);
}

