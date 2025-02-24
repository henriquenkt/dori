const { handler } = require('./index');
const payload = require('./payload.json');

// Filtra a configuração que você deseja usar, por exemplo, pela propriedade "name"
const config = payload.configurations.find(c =>
  c.name.startsWith("f0WBzzfksHIdHcmOnboardingPreAdmissionSaveAndFinish")
);

if (!config) {
  console.error("Configuração não encontrada!");
  process.exit(1);
}

// Extrai o objeto de payload (o evento) da configuração
const event = config.lambda.payload.json;

handler(event)
  .then(response => {
    console.log('Response:', response);
  })
  .catch(error => {
    console.error('Error:', error);
  });
