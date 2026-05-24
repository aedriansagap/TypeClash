import Link from 'next/link';

export default function Contact() {
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)', color: '#fff', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <Link href="/" style={{ color: '#60a5fa', textDecoration: 'none', marginBottom: '2rem', display: 'inline-block' }}>← Back to Game</Link>
        <h1 style={{ fontSize: '3rem', marginBottom: '1rem', background: 'linear-gradient(135deg, #38bdf8, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Contact Us</h1>
        <p style={{ fontSize: '1.2rem', lineHeight: '1.6', marginBottom: '1.5rem', color: '#cbd5e1' }}>
          Have feedback, found a bug, or just want to say hi? We'd love to hear from you.
        </p>
        <p style={{ fontSize: '1.2rem', lineHeight: '1.6', marginBottom: '1.5rem', color: '#cbd5e1' }}>
          <strong>Developer:</strong> aedriansagap<br/>
          <strong>GitHub:</strong> <a href="https://github.com/aedriansagap/TypeClash" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'none' }}>View Repository</a>
        </p>
        <p style={{ fontSize: '1.2rem', lineHeight: '1.6', marginBottom: '1.5rem', color: '#cbd5e1' }}>
          For support or business inquiries, please open an issue on the GitHub repository or reach out via our community channels.
        </p>
      </div>
    </div>
  );
}
