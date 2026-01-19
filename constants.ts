/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { LayoutOption, LayoutPreset } from "./types";

export const INITIAL_PLACEHOLDERS = [
    "Design a minimalist weather card",
    "Show me a live stock ticker",
    "Create a futuristic login form",
    "Build a stock portfolio dashboard",
    "Make a brutalist music player",
    "Generate a sleek pricing table",
    "Ask for anything"
];

export const LAYOUT_OPTIONS: LayoutOption[] = [
    { name: 'Grid', className: 'layout-grid' },
    { name: 'Stack', className: 'layout-stack' },
    { name: 'Filmstrip', className: 'layout-filmstrip' },
];

export const LAYOUT_PRESETS: LayoutPreset[] = [
    { 
        name: 'Default', 
        styles: {
            '--card-gap': '24px',
            '--card-radius': '12px',
            '--card-border': '1px solid var(--border-color)',
            '--card-shadow': '0 10px 30px -10px rgba(0,0,0,0.5)',
        }
    },
    { 
        name: 'Spacious', 
        styles: {
            '--card-gap': '36px',
            '--card-radius': '24px',
            '--card-border': '1px solid var(--border-color)',
            '--card-shadow': '0 15px 40px -15px rgba(0,0,0,0.6)',
        }
    },
    { 
        name: 'Compact', 
        styles: {
            '--card-gap': '12px',
            '--card-radius': '8px',
            '--card-border': '1px solid transparent',
            '--card-shadow': '0 5px 15px -8px rgba(0,0,0,0.4)',
        }
    }
];