import Link from 'next/link';

export default function AuthCodeError() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Authentication Error</h1>
      <p>Sorry, something went wrong during the authentication process.</p>
      <p>This could be due to an invalid code or a server issue.</p>
      <Link href="/">
        <button style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
          Return Home
        </button>
      </Link>
    </div>
  );
} 