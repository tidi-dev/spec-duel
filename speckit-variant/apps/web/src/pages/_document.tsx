import { ComponentType, ReactElement } from 'react';
import Document, { DocumentContext, DocumentInitialProps, Head, Html, Main, NextScript } from 'next/document';
import createEmotionServer from '@emotion/server/create-instance';
import { createEmotionCache } from '../styles/create-emotion-cache';
import type { RoombookAppProps } from './_app';

type RoombookDocumentProps = DocumentInitialProps & { emotionStyleTags: ReactElement[] };

export default function RoombookDocument({ emotionStyleTags }: RoombookDocumentProps) {
  return (
    <Html lang="en">
      <Head>{emotionStyleTags}</Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

RoombookDocument.getInitialProps = async (ctx: DocumentContext): Promise<RoombookDocumentProps> => {
  const originalRenderPage = ctx.renderPage;
  const cache = createEmotionCache();
  const { extractCriticalToChunks } = createEmotionServer(cache);

  ctx.renderPage = () =>
    originalRenderPage({
      enhanceApp: (App: ComponentType<RoombookAppProps>) =>
        function EnhanceApp(props) {
          return <App emotionCache={cache} {...props} />;
        },
    });

  const initialProps = await Document.getInitialProps(ctx);
  const emotionStyleTags = extractCriticalToChunks(initialProps.html).styles.map((style) => (
    <style
      data-emotion={`${style.key} ${style.ids.join(' ')}`}
      key={style.key}
      dangerouslySetInnerHTML={{ __html: style.css }}
    />
  ));

  return { ...initialProps, emotionStyleTags };
};
