import { Schema } from "effect";

export const UserIdentity = <CustomClaimsFields extends Schema.Struct.Fields>(
  customClaimsFields: CustomClaimsFields,
) =>
  Schema.Struct({
    ...customClaimsFields,
    tokenIdentifier: Schema.String,
    subject: Schema.String,
    issuer: Schema.String,
    name: Schema.optionalKey(Schema.String),
    givenName: Schema.optionalKey(Schema.String),
    familyName: Schema.optionalKey(Schema.String),
    nickname: Schema.optionalKey(Schema.String),
    preferredUsername: Schema.optionalKey(Schema.String),
    profileUrl: Schema.optionalKey(Schema.String),
    pictureUrl: Schema.optionalKey(Schema.String),
    email: Schema.optionalKey(Schema.String),
    emailVerified: Schema.optionalKey(Schema.Boolean),
    gender: Schema.optionalKey(Schema.String),
    birthday: Schema.optionalKey(Schema.String),
    timezone: Schema.optionalKey(Schema.String),
    language: Schema.optionalKey(Schema.String),
    phoneNumber: Schema.optionalKey(Schema.String),
    phoneNumberVerified: Schema.optionalKey(Schema.Boolean),
    address: Schema.optionalKey(Schema.String),
    updatedAt: Schema.optionalKey(Schema.String),
  });
