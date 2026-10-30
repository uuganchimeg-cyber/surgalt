# Firebase and Cloudinary setup

The app reads and writes school data only through its authenticated server API.
Firebase Realtime Database client rules should continue to deny direct client
reads and writes.

## Firebase

1. Enable Firebase Authentication in the Firebase Console and add the production
   hostname under Authentication settings → Authorized domains.
2. Create a Realtime Database for the configured Firebase project. Keep
   `database.rules.json` set to deny client reads and writes, then deploy it with:

   ```powershell
   npx firebase-tools deploy --only database
   ```

3. Store the Firebase Admin service-account JSON as
   `FIREBASE_SERVICE_ACCOUNT_BASE64` in `.env.local`. Keep the key private and
   out of source control.
4. Initialize a new, empty database once:

   ```powershell
   npm run firebase:bootstrap
   ```

   Bootstrap creates the teacher login `bagsh` / `1234` and empty school-data
   collections. It does not add sample students, attendance, grades, homework,
   submissions, or announcements. It refuses to overwrite an existing `appData`
   node.
5. Start the app with `npm run dev`. Add real students and school records from
   the teacher dashboard; those records are stored in Realtime Database. Student
   login names and PINs are stored there as salted hashes.

## Cloudinary

Set `CLOUDINARY_URL` in `.env.local` using the Cloudinary cloud name, API key,
and API secret. Keep the API secret private; the server uses it to sign image
uploads.
