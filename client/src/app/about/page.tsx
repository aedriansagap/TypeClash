import Link from 'next/link';

export default function About() {
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)', color: '#fff', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <Link href="/" style={{ color: '#60a5fa', textDecoration: 'none', marginBottom: '2rem', display: 'inline-block' }}>← Back to Game</Link>
        <h1 style={{ fontSize: '3rem', marginBottom: '1rem', background: 'linear-gradient(135deg, #38bdf8, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>About TypeClash</h1>
        <p style={{ fontSize: '1.2rem', lineHeight: '1.6', marginBottom: '1.5rem', color: '#cbd5e1' }}>
          TypeClash is a fast-paced, real-time competitive multiplayer typing game designed to test your speed, accuracy, and composure under pressure. 
        </p>
        <p style={{ fontSize: '1.2rem', lineHeight: '1.6', marginBottom: '1.5rem', color: '#cbd5e1' }}>
          Unlike traditional typing tests that just measure Words Per Minute (WPM), TypeClash introduces a survival mechanic. Words fall from the top of the screen, and you must type them before they reach the bottom. 
        </p>
        <p style={{ fontSize: '1.2rem', lineHeight: '1.6', marginBottom: '1.5rem', color: '#cbd5e1' }}>
          In multiplayer matches, flawless typing builds your combo multiplier. Hitting a 5-combo sends a wave of "Garbage Words" to your opponent, bringing an intense, competitive edge to improving your typing skills.
        </p>
      </div>
    </div>
  );
}
