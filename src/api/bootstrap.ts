import { configureSupabaseFromEnv } from './client';
import { configureDataSpaceClient } from './dataspace';
configureSupabaseFromEnv();
const endpoint = import.meta.env.VITE_DATASPACE_GRAPHQL_URL as string | undefined;
const token = import.meta.env.VITE_DATASPACE_TOKEN as string | undefined;
if (endpoint) configureDataSpaceClient({ endpoint, token });
