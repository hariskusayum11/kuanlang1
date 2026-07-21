import { getAuthTables } from "better-auth/db";
import { auth } from "./auth";

const tables = getAuthTables(auth.options);
for (const [model, def] of Object.entries<any>(tables)) {
  const fields = Object.entries<any>(def.fields).map(([name, f]) => {
    const parts = [name + ":" + f.type];
    if (f.required) parts.push("required");
    if (f.unique) parts.push("unique");
    if (f.references) parts.push(`ref->${f.references.model}.${f.references.field}`);
    if (f.fieldName && f.fieldName !== name) parts.push(`col=${f.fieldName}`);
    return "    " + parts.join(" ");
  });
  console.log(`MODEL ${model} (table=${def.modelName})`);
  console.log(fields.join("\n"));
  console.log("");
}
