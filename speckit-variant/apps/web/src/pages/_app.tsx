// Must load before @roombook/contract: its DTO decorators call Reflect.getMetadata at import time.
import 'reflect-metadata';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { CacheProvider, EmotionCache } from '@emotion/react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { AppLayout } from '../layouts/app-layout';
import { createEmotionCache } from '../styles/create-emotion-cache';

const clientSideEmotionCache = createEmotionCache();
const theme = createTheme();

export type RoombookAppProps = AppProps & { emotionCache?: EmotionCache };

export default function RoombookApp({ Component, pageProps, emotionCache = clientSideEmotionCache }: RoombookAppProps) {
  return (
    <CacheProvider value={emotionCache}>
      <Head>
        <meta name="viewport" content="initial-scale=1, width=device-width" />
        <title>Roombook</title>
      </Head>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AppLayout>
          <Component {...pageProps} />
        </AppLayout>
      </ThemeProvider>
    </CacheProvider>
  );
}
