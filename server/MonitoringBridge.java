import com.garmin.fit.*;
import java.io.*;
import java.time.ZoneId;
import java.util.*;

/** Adapter around the exact Garmin MonitoringReader used by FitActivityImporter.kt. */
public class MonitoringBridge {
 public static void main(String[] args) throws Exception {
  if(args.length!=1) throw new IllegalArgumentException("Timezone required");
  java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone(ZoneId.of(args[0])));
  final List<String> metrics=new ArrayList<>();
  MesgBroadcaster broadcaster=new MesgBroadcaster();
  MonitoringReader reader=new MonitoringReader(MonitoringReader.DAILY_INTERVAL);
  reader.outputDailyTotals();
  reader.addListener((MonitoringMesgListener) message -> {
   if(message.getActivityType()!=ActivityType.ALL || message.getTimestamp()==null) return;
   long duration=message.getDuration()==null?0L:(long)(message.getDuration().doubleValue()*1000.0);
   long startedAt=Math.max(0L,message.getTimestamp().getDate().getTime()-duration);
   int steps=Math.round(Math.max(0f,message.getCycles()==null?0f:message.getCycles()));
   float calories=Math.max(0f,message.getActiveCalories()!=null?message.getActiveCalories().floatValue():message.getCalories()!=null?message.getCalories().floatValue():0f);
   if(steps<=0 && calories<=0f)return;
   String day=new java.text.SimpleDateFormat("yyyy-MM-dd",Locale.US).format(new Date(startedAt));
   metrics.add("{\"day\":\""+day+"\",\"startedAt\":"+startedAt+",\"steps\":"+steps+",\"coveredSteps\":"+steps+",\"calories\":"+(double)calories+",\"source\":\"monitoring\"}");
  });
  broadcaster.addListener((FileIdMesgListener)reader);
  broadcaster.addListener((DeviceSettingsMesgListener)reader);
  broadcaster.addListener((MonitoringInfoMesgListener)reader);
  broadcaster.addListener((MonitoringMesgListener)reader);
  broadcaster.run(new BufferedInputStream(System.in));
  reader.broadcast();
  System.out.println("["+String.join(",",metrics)+"]");
 }
}
