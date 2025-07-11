// functions/src/index.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

admin.initializeApp();

const db = admin.firestore();

export const webhook = functions.https.onRequest((req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const sigHeader = req.headers['openphone-signature'] as string;
  if (!sigHeader) {
    return res.status(401).send('Missing openphone-signature');
  }

  const [scheme, version, timestamp, signature] = sigHeader.split(';');
  if (scheme !== 'hmac' || version !== '1') {
    return res.status(401).send('Invalid format');
  }

  const secret = functions.config().openphone.webhook_secret;
  if (!secret) {
    return res.status(500).send('Secret not set');
  }

  const key = Buffer.from(secret, 'base64');
  const payloadStr = JSON.stringify(req.body});
  const toSign = `${timestamp}.${payloadStr}`;
  const computedSig = crypto.createHmac('sha256', key).update(toSign).digest('base64');

  if (computedSig !== signature) {
    return res.status(401).send('Invalid signature');
  }

  const event = req.body;
  if (event.type === 'message.received' || event.type === 'message.delivered') {
    const msg = event.data.object;
    const convId = msg.conversationId;
    const msgId = msg.id;

    const convRef = db.collection('conversations').doc(convId);
    const msgRef = convRef.collection('messages').doc(msgId);

    msgRef.set({
      from: msg.from,
      to: msg.to,
      direction: msg.direction,
      text: msg.body,
      status: msg.status,
      createdAt: admin.firestore.Timestamp.fromDate(new Date(msg.createdAt))
    });

    convRef.set({
      participants: msg.direction === 'incoming' ? [msg.from] : msg.to,
      phoneNumberId: msg.phoneNumberId,
      lastActivityAt: admin.firestore.Timestamp.fromDate(new Date(msg.createdAt)),
      // name will be synced via API
    }, { merge: true });

    return res.status(200).send('OK');
  }

  return res.status(200).send('Ignored');
});
