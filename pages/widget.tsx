import { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next';
import Head from 'next/head';
import Script from 'next/script';
import { ContextType, useContext, useEffect, useState } from 'react';
import Widget from '../components/Widget';
import { assertOrigin } from '../lib/config';
import { ConfigContext, ThemeContext } from '../lib/context';
import { decodeState } from '../lib/oauth/state';
import { InputPosition, ISetConfigMessage } from '../lib/types/giscus';
import { cleanSessionParam, getOriginHost } from '../lib/utils';
import { env, Theme } from '../lib/variables';
import { getAppAccessToken } from '../services/github/getAppAccessToken';
import { getRepoConfig } from '../services/github/getConfig';
import { availableLanguages } from '../lib/i18n';
import Router from 'next/router';

export async function getServerSideProps({ query, res }: GetServerSidePropsContext) {
  const session = (query.session as string) || '';
  const repo = (query.repo as string) || '';
  const term = cleanSessionParam((query.term as string) || '');
  const category = (query.category as string) || '';
  const number = +query.number || 0;
  const repoId = (query.repoId as string) || '';
  const categoryId = (query.categoryId as string) || '';
  const description = (query.description as string) || '';
  const reactionsEnabled = Boolean(+query.reactionsEnabled);
  const emitMetadata = Boolean(+query.emitMetadata);
  const inputPosition = (query.inputPosition === 'top' ? 'top' : 'bottom') as InputPosition;
  const theme = ((query.theme as string) || 'light') as Theme;
  const { origin, originHost } = getOriginHost((query.origin as string) || '');

  const { encryption_password } = env;
  const token = await decodeState(session, encryption_password)
    .catch(() => getAppAccessToken(repo))
    .catch(() => '');

  const repoConfig = await getRepoConfig(repo, token);

  if (!assertOrigin(originHost, repoConfig)) {
    res.setHeader('Content-Security-Policy', `frame-ancestors 'self';`);
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  } else {
    let origins = repoConfig.origins || [];
    if (origins.indexOf(originHost) === -1) {
      origins = [...origins, originHost];
    }
    const originsStr = origins.join(' ');

    res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${originsStr};`);
  }

  const defaultCommentOrder = repoConfig.defaultCommentOrder || 'oldest';

  return {
    props: {
      origin,
      session,
      repo,
      term,
      category,
      number,
      repoId,
      categoryId,
      description,
      reactionsEnabled,
      emitMetadata,
      inputPosition,
      defaultCommentOrder,
      theme,
      originHost,
    },
  };
}

export default function WidgetPage({
  origin,
  session,
  repo,
  term,
  number,
  category,
  repoId,
  categoryId,
  description,
  reactionsEnabled,
  emitMetadata,
  inputPosition,
  defaultCommentOrder,
  theme,
  originHost,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const resolvedOrigin = origin || (typeof location === 'undefined' ? '' : location.href);
  const { theme: resolvedTheme, setTheme } = useContext(ThemeContext);
  const [config, setConfig] = useState<ContextType<typeof ConfigContext>>({
    repo,
    term,
    number,
    category,
    reactionsEnabled,
    emitMetadata,
    inputPosition,
    defaultCommentOrder,
  });

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== originHost) return;
      if (typeof event.data !== 'object' || !event.data.giscus) return;

      const giscusData = event.data.giscus;
      if (!('setConfig' in giscusData)) return;

      const { setConfig: newConfig } = giscusData as ISetConfigMessage;

      if ('theme' in newConfig) {
        setTheme(newConfig.theme);
        delete newConfig.theme;
      }

      if (Router.isReady && newConfig.lang in availableLanguages) {
        Router.replace(Router.asPath, Router.asPath, {
          locale: newConfig.lang,
          scroll: false,
        });
        delete newConfig.lang;
      }

      setConfig((prevConfig) => ({ ...prevConfig, ...newConfig }));
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [originHost, setTheme]);

  useEffect(() => setTheme(theme), [setTheme, theme]);

  return (
    <>
      <Head>
        <base target="_top" />
      </Head>

      <main className="w-full mx-auto" data-theme={resolvedTheme}>
        <ConfigContext.Provider value={config}>
          <Widget
            origin={resolvedOrigin}
            session={session}
            repoId={repoId}
            categoryId={categoryId}
            description={description}
          />
        </ConfigContext.Provider>
      </main>

      <Script
        src="/js/iframeResizer.contentWindow.min.js"
        integrity="sha256-rbC2imHDJIBYUIXvf+XiYY+2cXmiSlctlHgI+rrezQo="
        crossOrigin="anonymous"
      />
    </>
  );
}
