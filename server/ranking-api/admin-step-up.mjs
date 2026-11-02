// This capability can initialize an unset PIN once; it cannot replace an existing PIN.
export const provisioningHash='fe749dc1fead48b4bc13004fb89f94df5bcd2b5c463bd0f15ad9280de9489d07';
export const authVersion='admin-step-up-20261102-v2';
export const transferHash='ab488fb08e292d9bd931cada8bf4a4deb2cf15cf7d611064e7a51534e6eafb48';
export const protectedAdminPath=path=>path.startsWith('/wealth/admin/')&&!['/wealth/admin/session','/wealth/admin/claim'].includes(path);
