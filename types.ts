/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';

export interface Artifact {
  id: string;
  styleName: string;
  html: string;
  status: 'streaming' | 'complete' | 'error';
  versions: { html: string; timestamp: number }[]; // History of this specific artifact
}

export interface Session {
    id: string;
    prompt: string;
    timestamp: number;
    artifacts: Artifact[];
}

export interface ComponentVariation { name: string; html: string; }
// Fix: Correct LayoutOption to use className, matching its usage in index.tsx
export interface LayoutOption { name: string; className: string; }

export interface LayoutPreset {
  name: string;
  styles: React.CSSProperties;
}