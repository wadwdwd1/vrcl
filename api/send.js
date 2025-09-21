const nodemailer = require('nodemailer');
const dns = require('dns').promises;
const querystring = require('querystring');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  let body = '';
  await new Promise(resolve => {
    req.on('data', chunk => { body += chunk });
    req.on('end', resolve);
  });

  const parsed = querystring.parse(body);
  const { from, to, message } = parsed;

  if (![from, to].every(email => /^[^@]+@[^@]+\.[^@]+$/.test(email))) {
    return res.status(400).send('Invalid email format.');
  }

  const domain = to.split('@')[1];

  async function getMX(domain) {
    try {
      const records = await dns.resolveMx(domain);
      records.sort((a, b) => a.priority - b.priority);
      return records[0].exchange;
    } catch (err) {
      console.error(`Failed to get MX record for ${domain}:`, err);
      return null;
    }
  }

  const mxHost = await getMX(domain);
  if (!mxHost) return res.status(500).send('Could not resolve recipient mail server.');

  const transporter = nodemailer.createTransport({
    host: mxHost,
    port: 25,
    secure: false,
    tls: {
      rejectUnauthorized: false
    }
  });

  const mailOptions = {
    from,
    to,
    subject: 'Direct Email',
    text: message
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    res.status(200).send(`Email sent: ${info.response}`);
  } catch (err) {
    console.error('Error sending email:', err);
    res.status(500).send(`Failed to send email: ${err.message}`);
  }
};
