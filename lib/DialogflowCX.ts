import { SessionsClient } from '@google-cloud/dialogflow-cx';
import {
    IHttp,
    IModify,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { AppSetting } from '../config/Settings';
import {
    DialogflowRequestType,
    IDialogflowEvent,
    IDialogflowMessage,
    IDialogflowQuickReplies,
    LanguageCode,
} from '../enum/Dialogflow';
import { Logs } from '../enum/Logs';
import { getAppSettingValue } from './Settings';

class DialogflowCXClass {
    public async sendRequest(
        http: IHttp,
        read: IRead,
        modify: IModify,
        sessionId: string,
        request: string | IDialogflowEvent,
        requestType: DialogflowRequestType,
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
                private_key: privateKey.replace(/\\n/g, '\n'),
            },
            apiEndpoint: `${location}-dialogflow.googleapis.com`,
        });

        const dialogflowRequest = {
            session: sessionPath,
            queryInput: {
                ...requestType === DialogflowRequestType.MESSAGE && {
                    text: {
                        text: request as string,
                    },
                },
                ...requestType === DialogflowRequestType.EVENT && {
                    event: {
                        event: (request as IDialogflowEvent).name,
                    },
                },
                languageCode,
            },
        };

        try {
            const [response] = await client.detectIntent(dialogflowRequest);
            return this.parseRequest(response, sessionId);
        } catch (error) {
            throw new Error(`${Logs.DIALOGFLOW_REST_API_ERROR} ${ (error as Error).message }`);
        }
    }

    public parseRequest(response: any, sessionId: string): IDialogflowMessage {
        const { queryResult } = response;
        const parsedMessage: IDialogflowMessage = {
            isFallback: false,
            sessionId,
        };

        if (queryResult && queryResult.responseMessages) {
            const messages: Array<string | IDialogflowQuickReplies> = [];
            queryResult.responseMessages.forEach((message) => {
                if (message.text) {
                    messages.push(message.text.text[0]);
                }
                if (message.payload) {
                    const { richContent, ...payload } = message.payload;
                    if (richContent) {
                        richContent.forEach((richContentRow) => {
                            richContentRow.forEach((richContentItem) => {
                                if (richContentItem.type === 'info') {
                                    messages.push({
                                        title: richContentItem.title,
                                        subtitle: richContentItem.subtitle,
                                        image_url: richContentItem.image ? richContentItem.image.src.rawUrl : '',
                                        buttons: richContentItem.actionLink ? [{
                                            text: richContentItem.actionLink.text,
                                            postback: richContentItem.actionLink.link,
                                        }] : [],
                                    });
                                }
                            });
                        });
                    }
                    if (payload.quickReplies) {
                        const { text: optionsText, options } = payload.quickReplies;
                        if (optionsText && options) {
                            messages.push(payload.quickReplies);
                        }
                    }
                    if (payload.livechat) {
                        parsedMessage.action = 'livechat-transfer';
                    }
                    if (payload.closeChat) {
                        parsedMessage.action = 'close-chat';
                    }
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
