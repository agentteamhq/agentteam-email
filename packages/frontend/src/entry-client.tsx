import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start-client'

// eslint-disable-next-line no-restricted-syntax -- Browser entrypoint mounts the hydrated app.
hydrateRoot(globalThis.document, <StartClient />)
