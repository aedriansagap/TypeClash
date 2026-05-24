import Link from 'next/link';

export default function Privacy() {
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)', color: '#fff', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <Link href="/" style={{ color: '#60a5fa', textDecoration: 'none', marginBottom: '2rem', display: 'inline-block' }}>← Back to Game</Link>
        <h1 style={{ fontSize: '3rem', marginBottom: '1rem', background: 'linear-gradient(135deg, #38bdf8, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Privacy Policy</h1>
        
        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: '#f8fafc' }}>1. Data Collection</h2>
        <p style={{ fontSize: '1.1rem', lineHeight: '1.6', marginBottom: '1.5rem', color: '#cbd5e1' }}>
          TypeClash collects minimal data necessary to provide a seamless gaming experience. When you create an account, we store your username and securely hashed password. Your typing metrics (WPM, Accuracy, Scores) are saved to power the leaderboards.
        </p>
        
        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: '#f8fafc' }}>2. Data Usage</h2>
        <p style={{ fontSize: '1.1rem', lineHeight: '1.6', marginBottom: '1.5rem', color: '#cbd5e1' }}>
          Your data is solely used to maintain your account, track your personal progress, and display your top scores on the global leaderboard. We do not sell or share your data with third-party advertisers.
        </p>
        
        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: '#f8fafc' }}>3. Cookies & Local Storage</h2>
        <p style={{ fontSize: '1.1rem', lineHeight: '1.6', marginBottom: '1.5rem', color: '#cbd5e1' }}>
          TypeClash uses browser `localStorage` to securely store your active session token so you don't have to log in every time you visit. This token expires automatically.
        </p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: '#f8fafc' }}>4. Your Rights</h2>
        <p style={{ fontSize: '1.1rem', lineHeight: '1.6', marginBottom: '1.5rem', color: '#cbd5e1' }}>
          If you wish to have your account and associated score data permanently deleted, please contact us via the GitHub repository.
        </p>
      </div>
    </div>
  );
}
