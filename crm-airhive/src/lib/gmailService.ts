/**
 * Gmail API Service
 * 
 * Handles sending emails via the Google Workspace Gmail API.
 */

/**
 * Send an email via Gmail API
 * @param accessToken Valid Google OAuth access token
 * @param to Recipient email address
 * @param subject Email subject
 * @param body Email body (HTML or plain text)
 */
export async function sendGmailMessage(
    accessToken: string,
    to: string,
    subject: string,
    body: string
): Promise<void> {
    // Gmail API requires the message to be in RFC 2822 format and base64url encoded
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messagePart = [
        `To: ${to}`,
        `Subject: ${utf8Subject}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        '',
        body
    ].join('\n');

    const encodedMessage = Buffer.from(messagePart)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                raw: encodedMessage
            })
        }
    );

    if (!response.ok) {
        const error = await response.json();
        console.error('Gmail API Error:', error);
        throw new Error(error.error?.message || 'Failed to send email via Gmail API');
    }
}
