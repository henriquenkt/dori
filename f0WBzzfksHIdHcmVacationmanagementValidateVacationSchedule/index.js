/**
 * Nome da primitiva : validateVacationSchedule
 * Nome do dominio : hcm
 * Nome do serviço : vacationmanagement
 * Nome do tenant : dori-homologcombr
 **/

const { lambdaEvent, lambdaResponse, PlatformApi } = require('@seniorsistemas/fsw-aws-lambda');


exports.handler = async event => {

  let body = lambdaEvent.parseBody(event);

  let output = body.output;
  let input = body.input;
  let temProgAnt = false;
  let qtdAbono = input.vacationSchedules[0].vacationBonusDays == undefined ? 0 : input.vacationSchedules[0].vacationBonusDays;

  if (qtdAbono > 0) {
    // Busca periodo de ferias
    let periodoId = input.vacationSchedules[0].vacationPeriodId;
    const eventInfo = lambdaEvent.createEventInfo(event);
    let programacoesAnteriores = ''
    // eventInfo.platformToken = event.headers.Authorization

    // Busca informações de programações já cadastradas

    // let progAntCad = await PlatformApi.Get(eventInfo,`/hcm/vacationmanagement/entities/vacationperiod/${periodoId}`);
    // if (progAntCad) {
    //     temProgAnt = true;
    // }

    // Busca programações anteriores já aprovadas
    try {
      programacoesAnteriores = await PlatformApi.Get(eventInfo, `/hcm/vacationmanagement/entities/individualvacationschedule/?filter=vacationperiod.id eq '${periodoId}'`);

      if (programacoesAnteriores?.contents?.length > 0) {
        temProgAnt = true;
      }
    }
    catch (error) {
      output = error
    }

    // Busca programações anteriores ainda não aprovadas
    try {
      programacoesAnteriores = await PlatformApi.Get(eventInfo, `/hcm/vacationmanagement/entities/vacationrequestupdate?filter=(personrequestupdate.requestStatus eq 0 or personrequestupdate.requestStatus eq 12 or personrequestupdate.requestStatus eq 4 or personrequestupdate.requestStatus eq 10 or personrequestupdate.requestStatus eq 11)  and vacationperiod.id eq '${periodoId}'`);
      if (programacoesAnteriores?.contents.length > 0) {
        temProgAnt = true;
      }
    }
    catch (error) {
      output = error
    }
    if (temProgAnt) {
      let mesgAbono = {
        "type": "TYPE_13_FRACTIONING_NOT_COMPATIBLE",
        "message": "O abono só pode ser solicitado na primeira programação de férias do período."
      }
      if (Object.keys(output.vacationScheduleMessages).length == 0) {
        const validationMessages = {
          "validationMessages": [{
            "type": "TYPE_13_FRACTIONING_NOT_COMPATIBLE",
            "message": "O abono só pode ser solicitado na primeira programação de férias do período."
          }]

        }
        output.vacationScheduleMessages.push(validationMessages);
      }
      else {
        output.vacationScheduleMessages[0].validationMessages.push(mesgAbono);
      }

    }
  }


  return sendRes(200, output);
  //return lambdaResponse.success(output);
};

// Retorna 
const sendRes = (status, body) => {
  var response = {
    statusCode: status,
    headers: {
      "Content-Type": "application/json"
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
  return response;
};
