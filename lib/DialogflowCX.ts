import { SessionsClient } from '@google-cloud/dialogflow-cx';
import {
    IHttp,
    IModify,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { AppSetting } from '../config/Settings';
import {
    IDialogflowMessage,
    LanguageCode,
} from '../enum/Dialogflow';
import { Logs } from '../enum/Logs';
import { getAppSettingValue } from './Settings';

interface IDetectIntentResponse {
    queryResult?: {
        responseMessages?: Array<{
            text?: {
                text?: Array<string>;
            };
        }>;
    };
}

class DialogflowCXClass {
    public async sendRequest(
        http: IHttp,
        read: IRead,
        modify: IModify,
        sessionId: string,
        request: string,
    ): Promise<IDialogflowMessage> {
        const projectId = await getAppSettingValue(read, AppSetting.DialogflowProjectId);
        const agentId = await getAppSettingValue(read, AppSetting.DialogflowAgentId);
        const location = await getAppSettingValue(read, AppSetting.DialogflowLocation);
        const languageCode = await getAppSettingValue(read, AppSetting.DialogflowDefaultLanguage) || LanguageCode.EN;

        const clientEmail = await getAppSettingValue(read, AppSetting.DialogflowClientEmail);
        const privateKey = await getAppSettingValue(read, AppSetting.DialogFlowPrivateKey);

        const sessionPath = `projects/${projectId}/locations/${location}/agents/${agentId}/sessions/${sessionId}`;

        const client = new SessionsClient({
            credentials: {
                client_email: clientEmail,
                private_key: privateKey,
            },
            apiEndpoint: `${location}-dialogflow.googleapis.com`,
        });

        const dialogflowRequest = {
            session: sessionPath,
            queryInput: {
                text: {
                    text: request,
                },
                languageCode,
            },
        };

        try {
            const [response] = await client.detectIntent(dialogflowRequest);
            return this.parseRequest(response);
        } catch (error) {
            throw new Error(`${Logs.DIALOGFLOW_REST_API_ERROR} ${ (error as Error).message }`);
        }
    }

    public parseRequest(response: IDetectIntentResponse): IDialogflowMessage {
        const { queryResult } = response;
        const parsedMessage: IDialogflowMessage = {
            isFallback: false,
        };

        if (queryResult && queryResult.responseMessages) {
            const messages: Array<string> = [];
            queryResult.responseMessages.forEach((message) => {
                if (message.text) {
                    messages.push(message.text.text[0]);
                }
            });
            if (messages.length > 0) {
                parsedMessage.messages = messages;
            }
        }

        return parsedMessage;
    }
}

export const DialogflowCX = new DialogflowCXClass();
