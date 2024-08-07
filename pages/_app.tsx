// pages/_app.tsx
import { AppProps } from 'next/app';
import { Amplify } from 'aws-amplify';
import config from '../src/amplifyconfiguration.json';
import '../styles/globals.css'; // Ensure you import your global CSS

// Configure AWS Amplify
Amplify.configure(config);

function MyApp({ Component, pageProps }: AppProps) {
  console.log('wcnmmmmmmmmm');
  return <Component {...pageProps} />;
}

export default MyApp;
