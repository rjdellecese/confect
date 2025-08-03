import { Schema } from "effect";

export const UserIdentity = <CustomClaimsFields extends Schema.Struct.Fields>(
  customClaimsFields: CustomClaimsFields,
) =>
  Schema.Struct({
    ...customClaimsFields,
    tokenIdentifier: Schema.String,
    subject: Schema.String,
    issuer: Schema.String,
    name: Schema.optional(Schema.String),
    givenName: Schema.optional(Schema.String),
    familyName: Schema.optional(Schema.String),
    nickname: Schema.optional(Schema.String),
    preferredUsername: Schema.optional(Schema.String),
    profileUrl: Schema.optional(Schema.String),
    pictureUrl: Schema.optional(Schema.String),
    email: Schema.optional(Schema.String),
    emailVerified: Schema.optional(Schema.Boolean),
    gender: Schema.optional(Schema.String),
    birthday: Schema.optional(Schema.String),
    timezone: Schema.optional(Schema.String),
    language: Schema.optional(Schema.String),
    phoneNumber: Schema.optional(Schema.String),
    phoneNumberVerified: Schema.optional(Schema.Boolean),
    address: Schema.optional(Schema.String),
    updatedAt: Schema.optional(Schema.String),
  });
