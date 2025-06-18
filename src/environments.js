import "dotenv/config";

export const ENVIRONMENTS = {
  stg:    { label: "STG",
            uri: process.env.STG_URI,
            db:  process.env.STG_DB },

  sbxCs:  { label: "Sandbox-CS",
            uri: process.env.SBX_CS_URI,
            db:  process.env.SBX_CS_DB },

  sbxNav: { label: "Sandbox-Navega",
            uri: process.env.SBX_NAV_URI,
            db:  process.env.SBX_NAV_DB }
};