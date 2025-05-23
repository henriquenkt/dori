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
  eventInfo.platformToken = "Yd4BBpd9FWvJmRPEuIk4SEKGQDIZ3k77";
  let preAdmissionId = input.id;

  // Formata o CPF

  let cpfNumber = input.document.cpf.number.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

  // Formata o CNPJ

  let cnpjNumber = "";
  try {
    cnpjNumber = input?.contract?.branchOffice?.cnpj;
    cnpjNumber = cnpjNumber ? cnpjNumber.replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : ``;
  } catch (erro) {
    return sendRes(erro.response.status, "CNPJ não cadstrado:" + erro.response.statusText);
  }

  // Formata o UF Filial

  let state = input?.contract?.branchOffice?.state;
  let ufFilial = "";
  try {
    let resultFilial = await PlatformApi.Get(eventInfo, `/hcm/onboarding/queries/stateListQuery?filter=id eq '${state}'`);
    ufFilial = resultFilial.contents[0].abbreviation;
  } catch (erro) {
    return sendRes(erro.response.status, "Erro ao processar API stateListQuery:" + erro.response.statusText);
  }

  // Vale transporte

  let vt = input.customEntityData.customEntityOne.customFields.find((item) => item.field === "usaVt")?.value === "Sim" ? "(X) SIM ( ) NÃO:" : "( ) SIM (X) NÃO:";

  // Salário por extenso

  let salario = input.contract.customFields.find((item) => item.field === "salario")?.value || 0;
  let salarioExtenso = extenso.porExtenso(salario, "monetario");
  salarioExtenso = `${new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(salario)} (${salarioExtenso})`;

  // Refeitorio

  let refeitorio = input?.customEntityData?.customEntityOne?.customFields?.find((item) => item.field === "refeitorio")?.value || "Não";
  let refeicao =
    refeitorio === "Sim"
      ? `Pretende utilizar o benefício do Programa de Alimentação do Trabalhador, mantido no refeitório da DORI ALIMENTOS S.A., autorizando-a, expressamente, a proceder o desconto dos respectivos valores em folha de pagamento, nos limites do artigo 4º. da portaria do TEM número 3 de 01 de Março de 2002, do percentual de 20% sobre o valor da refeição.`
      : "Não pretende utilizar o aludido benefício, oferecido e mantido DORI ALIMENTOS S.A.";

  // Contribuição sindical

  let sindicato = input?.customEntityData?.customEntityOne?.customFields?.find((item) => item.field === "sindicato")?.value || "Não";
  let codigoSindicato = input?.contract?.customFields.find((item) => item.field === "sindicato")?.value || "Sindicato não cadastrado.";
  let nomeSindicato = "Sindicato não cadastrado.";
  let sindicatoPercentual = '';
  let limiteContribuicao = '';
  
  try {
    let customFields = await PlatformApi.Post(eventInfo, `/platform/field_customization/queries/getFieldCustomizationsMetadata`, {
      serviceId: {
        domain_: "hcm",
        service_: "onboarding",
      },
      translated: true,
    });
    nomeSindicato = customFields.entities_?.find(e => e.id === "inviteModelContract")
    ?.fields?.find(f => f.id === "sindicato")
    ?.customization?.customEnumeration?.values
    ?.find(v => v.key === codigoSindicato)?.value 
    ?? "Sindicato não cadastrado.";

    let sindicatoPlatform = await PlatformApi.Get(eventInfo, `/hcm/payroll/entities/syndicate?filter=code eq '${codigoSindicato}'`);
    sindicatoPercentual = sindicatoPlatform.contents[0].custom.percentualContribuicao || 'Percentual não cadastrado.';
    limiteContribuicao = sindicatoPlatform.contents[0].custom.limiteContribuicao || 'Contribuição não cadastrada.';
  
  } catch (erro) {
    console.error("Erro ao processar API getFieldCustomizationsMetadata:", erro.response.statusText);
    return sendRes(erro.response.status, "Erro ao processar API getFieldCustomizationsMetadata:" + erro.response.statusText);
  }

  let contribuicaoSindical =
    sindicato === "Sim"
      ? `Autorizo expressamente o desconto, a título de contribuição sindical do valor correspondente a ${sindicatoPercentual} de meu salário nominal - limitado ao teto de R$ ${limiteContribuicao} - para repasse ao ${nomeSindicato}.`
      : "Não autorizo desconto de qualquer valor a título de contribuição sindical.";

  // Vencimento do contrato

  let json = `{"preAdmissionId": "${preAdmissionId}"}`;
  json = JSON.parse(json);
  let result;
  let resultEscala;
  let resultHorario;
  let escala_contrato1 = "";
  let escala_contrato4 = "";

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
      if (resultHorario.contents.length === 4) {
        const entradaObj = resultHorario.contents.find((item) => item.clockingEventSequence === 1);
        const saidaObj = resultHorario.contents.find((item) => item.clockingEventSequence === 4);

        // Caso também queira calcular o intervalo (supondo que os outros eventos sejam, por exemplo, sequência 2 e 4):
        const intervaloInicioObj = resultHorario.contents.find((item) => item.clockingEventSequence === 2);
        const intervaloFimObj = resultHorario.contents.find((item) => item.clockingEventSequence === 3);

        entrada = moment.utc(entradaObj.clockingEventTime * 60000).format("HH:mm");
        saida = moment.utc(saidaObj.clockingEventTime * 60000).format("HH:mm");

        // Calculando o intervalo (duração do intervalo, se essa for a lógica desejada)
        intervalo = moment.utc((intervaloFimObj.clockingEventTime - intervaloInicioObj.clockingEventTime) * 60000).format("HH:mm");
      }

      if (resultHorario.contents.length === 2) {
        const entradaObj = resultHorario.contents.find((item) => item.clockingEventSequence === 1);
        const saidaObj = resultHorario.contents.find((item) => item.clockingEventSequence === 2);

        entrada = moment.utc(entradaObj.clockingEventTime * 60000).format("HH:mm");
        saida = moment.utc(saidaObj.clockingEventTime * 60000).format("HH:mm");

        // Calculando o intervalo (duração do intervalo, se essa for a lógica desejada)
        intervalo = moment.utc(0 * 60000).format("HH:mm");
      }

      escala_contrato1 += horario < 9997 && sequencia === 1 ? `Segunda-Feira: das ${entrada} às ${saida}, com ${intervalo} de intervalo<br/>` : "";
      escala_contrato1 += horario < 9997 && sequencia === 2 ? `Terça-Feira: das ${entrada} às ${saida}, com ${intervalo} de intervalo<br/>` : "";
      escala_contrato1 += horario < 9997 && sequencia === 3 ? `Quarta-Feira: das ${entrada} às ${saida}, com ${intervalo} de intervalo<br/>` : "";
      escala_contrato1 += horario < 9997 && sequencia === 4 ? `Quinta-Feira: das ${entrada} às ${saida}, com ${intervalo} de intervalo<br/>` : "";
      escala_contrato1 += horario < 9997 && sequencia === 5 ? `Sexta-Feira: das ${entrada} às ${saida}, com ${intervalo} de intervalo<br/>` : "";
      escala_contrato1 += horario < 9997 && sequencia === 6 && entrada && intervalo === "00:00" ? `Sábado: das ${entrada} às ${saida}<br/>` : "";
      escala_contrato1 += horario < 9997 && sequencia === 6 && entrada && intervalo !== "00:00" ? `Sábado: das ${entrada} às ${saida}, com ${intervalo} de intervalo<br/>` : "";
      escala_contrato1 += horario === 9998 && sequencia === 6 && !entrada ? "Sábado: Compensado<br/>" : ``;
      escala_contrato1 += (horario === 9999 || horario === 9996) && sequencia === 6 && !entrada ? "Sábado: FOLGA<br/>" : ``;
      escala_contrato1 += (horario === 9999 || horario === 9996) && sequencia === 7 ? `Domingo: FOLGA` : "";

      escala_contrato4 = horario < 9997 ? `Das ${entrada} às ${saida}, com ${intervalo} de intervalo` : escala_contrato4;
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

  json = {
    preAdmissionId: preAdmissionId,
    customFields: [
      {
        field: "formated_cpf",
        value: cpfNumber,
      },
      {
        field: "formated_cnpj",
        value: cnpjNumber,
      },
      {
        field: "uf_filial",
        value: ufFilial,
      },
      {
        field: "salarioExtenso",
        value: salarioExtenso,
      },
      {
        field: "refeicao",
        value: refeicao,
      },
      {
        field: "contribuicaoSindical",
        value: contribuicaoSindical,
      },
      {
        field: "vencimentoContrato",
        value: vencimentoContrato,
      },
      {
        field: "escala_contrato1",
        value: escala_contrato1,
      },
      {
        field: "escala_contrato4",
        value: escala_contrato4,
      },
      {
        field: "valeTransporte",
        value: vt,
      },
    ],
  };

  if (input?.contract?.company?.id) {
    json.company = {
      id: input?.contract?.company?.id,
      companyName: input?.contract?.company?.companyName,
      code: input?.contract?.company?.code,
    };
  }

  if (input?.contract?.branchOffice?.id) {
    json.branchOffice = {
      id: input?.contract?.branchOffice?.id,
      branchOfficeName: input?.contract?.branchOffice?.branchOfficeName,
      tradingName: input?.contract?.branchOffice?.tradingName,
      code: input?.contract?.branchOffice?.code,
    };
  }

  if (input?.contract?.area?.id) {
    json.area = {
      id: input?.contract?.area?.id,
      name: input?.contract?.area?.name,
      code: input?.contract?.area?.code,
    };
  }

  if (input?.contract?.jobPosition?.id) {
    json.jobPosition = {
      id: input?.contract?.jobPosition?.id,
      name: input?.contract?.jobPosition?.name,
      code: input?.contract?.jobPosition?.code,
    };
  }

  if (input?.contract?.costCenter?.id) {
    json.costCenter = {
      id: input?.contract?.costCenter?.id,
      code: input?.contract?.costCenter?.code,
      name: input?.contract?.costCenter?.name,
    };
  }

  if (input?.contract?.workstation?.id) {
    json.workstation = {
      id: input?.contract?.workstation?.id,
      code: input?.contract?.workstation?.code,
      name: input?.contract?.workstation?.name,
    };
  }

  console.log(json);
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
