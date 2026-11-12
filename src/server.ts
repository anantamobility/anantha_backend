import app from "./app.js"
import envConfig from "./config/env.js"

app.listen(envConfig.port,()=>{
    console.log(`server listening on ${envConfig.port}`)
});