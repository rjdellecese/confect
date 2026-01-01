import { Schema } from "effect";

//#region src/api/UserIdentity.d.ts
declare namespace UserIdentity_d_exports {
  export { UserIdentity };
}
declare const UserIdentity: <CustomClaimsFields extends Schema.Struct.Fields>(customClaimsFields: CustomClaimsFields) => Schema.Struct<CustomClaimsFields & {
  tokenIdentifier: typeof Schema.String;
  subject: typeof Schema.String;
  issuer: typeof Schema.String;
  name: Schema.optionalWith<typeof Schema.String, {
    exact: true;
  }>;
  givenName: Schema.optionalWith<typeof Schema.String, {
    exact: true;
  }>;
  familyName: Schema.optionalWith<typeof Schema.String, {
    exact: true;
  }>;
  nickname: Schema.optionalWith<typeof Schema.String, {
    exact: true;
  }>;
  preferredUsername: Schema.optionalWith<typeof Schema.String, {
    exact: true;
  }>;
  profileUrl: Schema.optionalWith<typeof Schema.String, {
    exact: true;
  }>;
  pictureUrl: Schema.optionalWith<typeof Schema.String, {
    exact: true;
  }>;
  email: Schema.optionalWith<typeof Schema.String, {
    exact: true;
  }>;
  emailVerified: Schema.optionalWith<typeof Schema.Boolean, {
    exact: true;
  }>;
  gender: Schema.optionalWith<typeof Schema.String, {
    exact: true;
  }>;
  birthday: Schema.optionalWith<typeof Schema.String, {
    exact: true;
  }>;
  timezone: Schema.optionalWith<typeof Schema.String, {
    exact: true;
  }>;
  language: Schema.optionalWith<typeof Schema.String, {
    exact: true;
  }>;
  phoneNumber: Schema.optionalWith<typeof Schema.String, {
    exact: true;
  }>;
  phoneNumberVerified: Schema.optionalWith<typeof Schema.Boolean, {
    exact: true;
  }>;
  address: Schema.optionalWith<typeof Schema.String, {
    exact: true;
  }>;
  updatedAt: Schema.optionalWith<typeof Schema.String, {
    exact: true;
  }>;
}>;
//#endregion
export { UserIdentity, UserIdentity_d_exports };
//# sourceMappingURL=UserIdentity.d.ts.map