import { z } from 'zod'

// Extension CSP forbids even Zod's caught Function-constructor capability probe.
z.config({ jitless: true })
