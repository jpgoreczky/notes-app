// pg already treats sslmode=require as verify-full; make it explicit to keep that behavior
// (and silence pg's deprecation warning) without editing the Neon-managed .env.local.
function withVerifyFull(url) {
	const parsed = new URL(url);
	parsed.searchParams.set('sslmode', 'verify-full');
	return parsed.toString();
}

module.exports = { withVerifyFull };
