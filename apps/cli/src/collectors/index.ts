import { collector as c0 } from './orgs.js';
import { collector as c1 } from './repos.js';
import { collector as c2 } from './lfs.js';
import { collector as c3 } from './teams.js';
import { collector as c4 } from './actions.js';
import { collector as c5 } from './actions-secrets.js';
import { collector as c6 } from './policies.js';
import { collector as c7 } from './security.js';
import { collector as c8 } from './integrations.js';
import { collector as c9 } from './users.js';
import { collector as c10 } from './packages.js';
import type { Collector } from './types.js';
export const collectors: readonly Collector[] = [
  c0,
  c1,
  c2,
  c3,
  c4,
  c5,
  c6,
  c7,
  c8,
  c9,
  c10,
];
