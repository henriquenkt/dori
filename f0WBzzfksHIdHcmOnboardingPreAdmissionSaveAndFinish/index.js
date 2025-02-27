/**
 * Nome da primitiva : preAdmissionSaveAndFinish
 * Nome do dominio : hcm
 * Nome do serviço : onboarding
 * Nome do tenant : dori-homologcombr
 **/

const { lambdaEvent, lambdaResponse, PlatformApi } = require("@seniorsistemas/fsw-aws-lambda");
const extenso = require("numero-por-extenso");
const moment = require("moment");

exports.handler = async (event) => {
  let body = lambdaEvent.parseBody(event);
  let input = body.input;
  const eventInfo = lambdaEvent.createEventInfo(event);
  eventInfo.platformToken = "3sIECz896usgpIost4wevIaBxtcCKi1i";


  // Formata o CPF

  let preAdmissionId = input.id;
  let cpfNumber = input.document.cpf.number.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");


  // Salário por extenso

  let salario = input.contract.customFields.find((item) => item.field === "salario")?.value || 0;
  let salarioExtenso = extenso.porExtenso(salario, "monetario");
  salarioExtenso = `${new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(salario)} (${salarioExtenso})`;


  // Refeitorio

  let refeitorio = input.customEntityData.customEntityOne.customFields.find((item) => item.field === "refeitorio")?.value || "Não";
  let refeicao =
    refeitorio === "Sim"
      ? `Pretende utilizar o benefício do Programa de Alimentação do Trabalhador, mantido no refeitório da DORI ALIMENTOS S.A., autorizando-a, expressamente, a proceder o desconto dos respectivos valores em folha de pagamento, nos limites do artigo 4º. da portaria do TEM número 3 de 01 de Março de 2002, do percentual de 20% sobre o valor da refeição.`
      : "Não pretende utilizar o aludido benefício, oferecido e mantido DORI ALIMENTOS S.A.";


  // Contribuição sindical

  let sindicato = input.customEntityData.customEntityOne.customFields.find((item) => item.field === "sindicato")?.value || "Não";
  let contribuicaoSindical =
    sindicato === "Sim"
      ? `Autorizo expressamente o desconto, a título de contribuição sindical do valor correspondente a 1,2% (um vírgula dois por cento) de meu salário nominal - limitado ao teto de R$ 49,00 (quarenta e nove reais) - para repasse ao Sindicato dos Trabalhadores nas Indústrias da Alimentação e Afins de Marília (STIAM).`
      : "Não autorizo desconto de qualquer valor a título de contribuição sindical.";


  // Vencimento do contrato

  let json = `{"preAdmissionId": "${preAdmissionId}"}`;
  json = JSON.parse(json);
  let resultEscala;
  let resultHorario;
  let texto = '';


  // Escala

  try {
    let escala = input.contract.customFields.find((item) => item.field === "escala")?.value || 0;

    resultEscala = await PlatformApi.Get(eventInfo, `/hcm/general_register/entities/workshiftSchedule?filter=workshift.code eq ${escala}`);

    const orderedCodes = resultEscala.contents
      .sort((a, b) => a.registerSequence - b.registerSequence)
      .map((item) => ({
        registerSequence: item.registerSequence,
        code: item.workSchedule.code,
      }));

    for (let horariosDiarios of orderedCodes) {
      let horario = horariosDiarios.code;
      let sequencia = horariosDiarios.registerSequence;
      let marcacaoHorario = [];
      let entrada;
      let saida;
      let intervalo;

      resultHorario = await PlatformApi.Get(eventInfo, `/hcm/general_register/entities/clockingEventOfWorkSchedule?filter=workSchedule.code eq ${horario}`);

      for (let i = 0; i < resultHorario.contents.length; i++) {
        marcacaoHorario[i] = moment.utc(resultHorario.contents[i].clockingEventTime * 60000).format("HH:mm");
      }
      if(resultHorario.contents.length === 4){
        entrada = moment.utc(resultHorario.contents[0].clockingEventTime * 60000).format("HH:mm");
        saida = moment.utc(resultHorario.contents[3].clockingEventTime * 60000).format("HH:mm");
        intervalo = moment.utc((resultHorario.contents[2].clockingEventTime - resultHorario.contents[1].clockingEventTime) * 60000).format("HH:mm");
      }
      
      texto += horario < 9997 && sequencia === 1 ? `Segunda-Feira: das ${entrada} às ${saida}, com ${intervalo} de intervalo\n` : '';
      texto += horario < 9997 && sequencia === 2 ? `Terça-Feira: das ${entrada} às ${saida}, com ${intervalo} de intervalo\n` : '';
      texto += horario < 9997 && sequencia === 3 ? `Quarta-Feira: das ${entrada} às ${saida}, com ${intervalo} de intervalo\n` : '';
      texto += horario < 9997 && sequencia === 4 ? `Quinta-Feira: das ${entrada} às ${saida}, com ${intervalo} de intervalo\n` : '';
      texto += horario < 9997 && sequencia === 5 ? `Sexta-Feira: das ${entrada} às ${saida}, com ${intervalo} de intervalo\n` : '';
      texto += horario === 9998 && sequencia === 6 && entrada ? `Sábado: das ${entrada} às ${saida}\n` : '';
      texto += horario === 9998 && sequencia === 6 && !entrada ? 'Sábado: Compensado\n' : ``;
      texto += horario === 9999 && sequencia === 7 ? `Domingo: FOLGA\n` : '';
    }

  } catch (erro) {
    console.error("Erro ao processar API clockingEventOfWorkSchedule:", erro.response.statusText);
    return sendRes(erro.response.status, "Erro ao processar API clockingEventOfWorkSchedule:" + erro.response.statusText);
  } 

  // Carrega dados da pré-admissão
  try {
    result = await PlatformApi.Post(eventInfo, `/hcm/onboarding/queries/preAdmissionQuery`, json);
  } catch (erro) {
    console.error("Erro ao processar API preAdmissionQuery:", erro.response.statusText);
    return sendRes(erro.response.status, "Erro ao processar API preAdmissionQuery:" + erro.response.statusText);
  }

  let admissionDate = result?.result?.contract?.preAdmission?.admissionDate;
  let vencimentoContrato;
  if (admissionDate) {
    vencimentoContrato = moment(admissionDate).add(45, "days").format("YYYY-MM-DD");
  }


  // Atuzaliza os dados da pré-admissão

  json = `{
        "preAdmissionId": "${preAdmissionId}",
        "company": {
            "id": "${input?.contract?.company?.id}",
            "companyName": "${input?.contract?.company?.companyName}",
            "code": "${input?.contract?.company?.code}" 
            },
        "branchOffice": {
            "id": "${input?.contract?.branchOffice?.id}",
            "branchOfficeName": "${input?.contract?.branchOffice?.branchOfficeName}",
            "tradingName": "${input?.contract?.branchOffice?.tradingName}",
            "code": "${input?.contract?.branchOffice?.code}"
        },
        "area": {
            "id": "${input?.contract?.area?.id}",
            "name": "${input?.contract?.area?.name}",
            "code": "${input?.contract?.area?.code}"
        },
        "jobPosition": {
            "id": "${input?.contract?.jobPosition?.id}",
            "name": "${input?.contract?.jobPosition?.name}",
            "code": "${input?.contract?.jobPosition?.code}"
        },
        "costCenter": {
            "id": "${input?.contract?.costCenter?.id}",
            "code": "${input?.contract?.costCenter?.code}",
            "name": "${input?.contract?.costCenter?.name}"
        },
        "workstationGroup": {
            "id": "${input?.contract?.workstationGroup?.id}",
            "code": "${input?.contract?.workstationGroup?.code}",
            "name": "${input?.contract?.workstationGroup?.name}"
        },
        "customFields": [{
            "field": "formated_cpf",
            "value": "${cpfNumber}"
        },
        {
            "field": "salarioExtenso",
            "value": "${salarioExtenso}"
        },
        {
            "field": "refeicao",
            "value": "${refeicao}"
        },
        {
            "field": "contribuicaoSindical",
            "value": "${contribuicaoSindical}"
        },
        {
            "field": "vencimentoContrato",
            "value": "${vencimentoContrato}"
        }]
    }`;
  json = JSON.parse(json);
  let retorno;

  try {
    retorno = await PlatformApi.Post(eventInfo, `/hcm/onboardingintegration/actions/preAdmissionUpdate`, json);
  } catch (erro) {
    console.error("Erro ao processar API preAdmissionUpdate:", erro.response.statusText);
    return sendRes(erro.response.status, "Erro ao processar API preAdmissionUpdate:" + erro.response.statusText);
  } 

  return sendRes(200, { result: true });
};


// Retorna
const sendRes = (status, body) => {
  var response = {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
  return response;
};
