const fs = require(`fs`);
const CurTime = new Date().toISOString().replace(/T/, " ").replace(/\..+/, "");

const package = JSON.parse(fs.readFileSync("package.json"));

package.buildTime = CurTime;
package.buildHash = require("child_process")
  .execSync("git rev-parse --short HEAD")
  .toString()
  .trim();

fs.writeFileSync("package.json", JSON.stringify(package, null, 2));

console.log("Written build time as:", CurTime);
