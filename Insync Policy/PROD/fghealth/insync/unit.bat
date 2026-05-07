set PATH=%PATH%;G:\tools\node-v16.13.1-win-x64;G:\tools\node-v16.13.1-win-x64\node_modules;
set IS_SQS_URL=https://sqs.ap-south-1.amazonaws.com/884682301008/insync-iunit
set IS_SQS_REGION=ap-south-1
set IS_SQS_KEY=
set IS_SQS_SECRET=
start "insync" "cmd /k cd C:\ganesh\git\insync && nodemon node index.js"
start "insync" "cmd /k cd C:\ganesh\git\insync\SyncNg && ng serve --proxy-config=proxy.conf.json"