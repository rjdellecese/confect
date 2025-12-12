import { Schema } from "effect";

export const UserIdentity = <CustomClaimsFields extends Schema.Struct.Fields>(
  customClaimsFields: CustomClaimsFields,
) =>
  Schema.Struct({
    ...customClaimsFields,
    tokenIdentifier: Schema.String,
    subject: Schema.String,
    issuer: Schema.String,
    name: Schema.optionalWith(Schema.String, { exact: true }),
    givenName: Schema.optionalWith(Schema.String, { exact: true }),
    familyName: Schema.optionalWith(Schema.String, { exact: true }),
    nickname: Schema.optionalWith(Schema.String, { exact: true }),
    preferredUsername: Schema.optionalWith(Schema.String, { exact: true }),
    profileUrl: Schema.optionalWith(Schema.String, { exact: true }),
    pictureUrl: Schema.optionalWith(Schema.String, { exact: true }),
    email: Schema.optionalWith(Schema.String, { exact: true }),
    emailVerified: Schema.optionalWith(Schema.Boolean, { exact: true }),
    gender: Schema.optionalWith(Schema.String, { exact: true }),
    birthday: Schema.optionalWith(Schema.String, { exact: true }),
    timezone: Schema.optionalWith(Schema.String, { exact: true }),
    language: Schema.optionalWith(Schema.String, { exact: true }),
    phoneNumber: Schema.optionalWith(Schema.String, { exact: true }),
    phoneNumberVerified: Schema.optionalWith(Schema.Boolean, { exact: true }),
    address: Schema.optionalWith(Schema.String, { exact: true }),
    updatedAt: Schema.optionalWith(Schema.String, { exact: true }),
  });
