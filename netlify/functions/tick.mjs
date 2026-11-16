import {tick} from "./santa.mjs";
export default async()=>{await tick()};
export const config={schedule:"*/5 * * * *"};
