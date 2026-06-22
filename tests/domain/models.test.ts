import { expectTypeOf, it } from 'vitest';

import type { FocusState } from '../../src/domain/models';
import type { Stage } from '../../src/domain/stages';

it('encodes focus stage invariants', () => {
  expectTypeOf<Extract<FocusState, { kind: 'ready' }>['topic']['stage']>().toEqualTypeOf<Stage>();
  expectTypeOf<Extract<FocusState, { kind: 'invalid-stage' }>['topic']['stage']>().toEqualTypeOf<null>();
});
